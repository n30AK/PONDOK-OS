import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getAccessToken } from "./auth";

type Member = { membership_id: string; user_id: string; membership_status: string; roles: string[]; role_names: string[] };
type Role = { id: string; role_key: string; role_name: string; is_system: boolean; organization_id: string | null; permission_keys: string[] };
type Permission = { permission_key: string; description: string; assignable: boolean };
type ScopeType = "campus" | "department" | "class" | "class_subject" | "dormitory" | "room";
type ScopeTarget = { target_id: string; label: string; parent_id?: string | null };
type ScopeAssignment = { id: string; target_id: string; valid_from: string; valid_until: string | null; reason: string; created_at: string; revoked_at: string | null };
type MemberScopes = Record<ScopeType, ScopeAssignment[]>;
type Props = { organizationId: string; permissions: string[]; institutionRoles?: string[] };
const SCOPE_LABELS: Record<ScopeType,string> = {
  campus: "Kampus", department: "Departemen / unit", class: "Rombongan belajar",
  class_subject: "Mapel pada kelas", dormitory: "Asrama", room: "Kamar",
};
const EMPTY_SCOPES: MemberScopes = { campus: [], department: [], class: [], class_subject: [], dormitory: [], room: [] };

const ROLE_GROUPS = [
  { title: "Yayasan & Pimpinan", keys: ["foundation_chair","foundation_secretary","foundation_treasurer","pondok_leader","pondok_deputy","pondok_secretary","pondok_treasurer"] },
  { title: "Pendidikan & Kesantrian", keys: ["academic_admin","academic_coordinator","school_principal","homeroom_teacher","teacher","student_affairs_coordinator","musyrif","safeguarding_officer"] },
  { title: "Layanan & Operasional", keys: ["finance_admin","finance_cashier","finance_verifier","hr_admin","hr_officer","procurement_officer","warehouse_staff","librarian","admission_officer","inventory_manager","boarding_supervisor","cms_editor","health_officer"] },
  { title: "Pengawasan", keys: ["read_only_auditor"] },
];
const ROLE_DISPLAY_NAMES: Record<string,string> = {
  institution_owner: "Pemilik Institusi", institution_admin: "Admin Pesantren",
  foundation_chair: "Ketua Yayasan", foundation_secretary: "Sekretaris Yayasan", foundation_treasurer: "Bendahara Yayasan",
  pondok_leader: "Pimpinan Pesantren", pondok_deputy: "Wakil Pimpinan", pondok_secretary: "Sekretaris Pesantren", pondok_treasurer: "Bendahara Pesantren",
  academic_admin: "Admin Akademik", academic_coordinator: "Koordinator Akademik", school_principal: "Kepala Sekolah",
  homeroom_teacher: "Wali Kelas", teacher: "Guru / Pengajar", student_affairs_coordinator: "Koordinator Kesantrian",
  musyrif: "Musyrif", safeguarding_officer: "Petugas Perlindungan Santri",
  finance_admin: "Admin Keuangan", finance_cashier: "Kasir", finance_verifier: "Verifikator Keuangan",
  hr_admin: "Admin SDM", hr_officer: "Petugas SDM", procurement_officer: "Petugas Pengadaan",
  warehouse_staff: "Petugas Gudang", librarian: "Pustakawan", admission_officer: "Petugas PPDB",
  inventory_manager: "Pengelola Inventaris", boarding_supervisor: "Pengawas Asrama", cms_editor: "Editor Website",
  health_officer: "Petugas Kesehatan", read_only_auditor: "Auditor / Pengawas",
};
const GROUP_LABELS: Record<string,string> = {
  academic:"Akademik & data santri", admissions:"PPDB", assets:"Aset", audit:"Audit", boarding:"Asrama & kesantrian",
  cms:"Website & publikasi", core:"Tata kelola", crm:"CRM, alumni & donatur", finance:"Keuangan & akuntansi",
  hr:"SDM, pengajar & payroll", inventory:"Inventaris & gudang", library:"Perpustakaan", procurement:"Pengadaan",
  reports:"Laporan", settings:"Pengaturan", sync:"Sinkronisasi",
};

export default function TenantAccessAdmin({ organizationId, permissions, institutionRoles = [] }: Props) {
  // Keep UI capability checks aligned with the server policy: institution owners
  // and administrators receive these tenant-scoped capabilities from the API.
  const isInstitutionAdmin = institutionRoles.some((role) => role === "institution_owner" || role === "institution_admin");
  const canManageMembers = permissions.includes("core.members.manage") || isInstitutionAdmin;
  const canManageRoles = permissions.includes("core.roles.manage") || isInstitutionAdmin;
  const [members,setMembers]=useState<Member[]>([]);
  const [roles,setRoles]=useState<Role[]>([]);
  const [permissionCatalog,setPermissionCatalog]=useState<Permission[]>([]);
  const [drafts,setDrafts]=useState<Record<string,string[]>>({});
  const [selectedRoleId,setSelectedRoleId]=useState("");
  const [roleName,setRoleName]=useState("");
  const [rolePermissions,setRolePermissions]=useState<string[]>([]);
  const [creatingRole,setCreatingRole]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [newEmail,setNewEmail]=useState("");
  const [newRoles,setNewRoles]=useState<string[]>([]);
  const [adding,setAdding]=useState(false);
  const [scopeTargets,setScopeTargets]=useState<Record<ScopeType,ScopeTarget[]>>({campus:[],department:[],class:[],class_subject:[],dormitory:[],room:[]});
  const [memberScopes,setMemberScopes]=useState<Record<string,MemberScopes>>({});
  const [scopeMemberId,setScopeMemberId]=useState("");
  const [scopeType,setScopeType]=useState<ScopeType>("campus");
  const [scopeTargetId,setScopeTargetId]=useState("");
  const [scopeReason,setScopeReason]=useState("");
  const [scopeValidUntil,setScopeValidUntil]=useState("");
  const [scopeLoading,setScopeLoading]=useState(false);
  const [scopeSaving,setScopeSaving]=useState(false);

  const request=useCallback(async(path:string,init?:RequestInit)=>{
    const token=await getAccessToken();
    const response=await fetch(`${(import.meta.env.VITE_API_URL??"").replace(/\/$/,"")}${path}`,{
      ...init,headers:{authorization:`Bearer ${token}`,"x-organization-id":organizationId,"content-type":"application/json",...(init?.headers??{})},cache:"no-store"
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message??data.error??"Permintaan pengelolaan hak akses gagal.");
    return data;
  },[organizationId]);

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const tasks:Promise<void>[]=[];
      if(canManageRoles){
        tasks.push(request("/v1/tenant/roles").then((result:any)=>{
          const nextRoles:Role[]=result.data?.roles??[];
          setRoles(nextRoles);setPermissionCatalog(result.data?.permissions??[]);
          setSelectedRoleId((current)=>current&&nextRoles.some((role)=>role.id===current)?current:(nextRoles.find((role)=>!role.is_system)?.id??nextRoles[0]?.id??""));
          setDrafts((current)=>({...current,...Object.fromEntries(nextRoles.map((role)=>[role.id,current[role.id]??role.permission_keys]))}));
        }));
      }
      if(canManageMembers){
        tasks.push(request("/v1/tenant/members").then((result:any)=>{
          const list:Member[]=result.data??[];setMembers(list);setDrafts((current)=>({...current,...Object.fromEntries(list.map((member)=>[member.membership_id,current[member.membership_id]??member.roles]))}));
        }));
      }
      await Promise.all(tasks);
    }catch(reason){setError(reason instanceof Error?reason.message:"Gagal memuat data hak akses.");}
    finally{setLoading(false);}
  },[request,canManageMembers,canManageRoles]);

  useEffect(()=>{void load();},[load]);

  const selectedRole=roles.find((role)=>role.id===selectedRoleId)??null;
  const editableRole=creatingRole||Boolean(selectedRole&&!selectedRole.is_system);
  const groupedPermissions=useMemo(()=>{
    const groups=new Map<string,Permission[]>();
    for(const item of permissionCatalog){
      const group=item.permission_key.split(".")[0]??"lainnya";
      const list=groups.get(group)??[];list.push(item);groups.set(group,list);
    }
    return [...groups.entries()].sort((a,b)=>(GROUP_LABELS[a[0]]??a[0]).localeCompare(GROUP_LABELS[b[0]]??b[0],"id"));
  },[permissionCatalog]);

  useEffect(()=>{
    if(creatingRole){return;}
    if(selectedRole){setRoleName(selectedRole.role_name);setRolePermissions(drafts[selectedRole.id]??selectedRole.permission_keys);}
    else{setRoleName("");setRolePermissions([]);}
  },[selectedRoleId,selectedRole?.id,selectedRole?.role_name,creatingRole]);

  const toggleRolePermission=(key:string,checked:boolean)=>{
    setRolePermissions((current)=>checked?[...current,key]:current.filter((item)=>item!==key));
  };
  const toggleMemberRole=(id:string,key:string,checked:boolean)=>{
    setDrafts((current)=>({...current,[id]:checked?[...(current[id]??[]),key]:(current[id]??[]).filter((item)=>item!==key)}));
  };
  const startNewRole=()=>{setCreatingRole(true);setSelectedRoleId("");setRoleName("");setRolePermissions([]);setError("");setNotice("");};
  const cancelNewRole=()=>{setCreatingRole(false);setSelectedRoleId(roles.find((role)=>!role.is_system)?.id??roles[0]?.id??"");};
  const saveRole=async(event:FormEvent)=>{
    event.preventDefault();setSaving("role");setError("");setNotice("");
    try{
      const result=await request("/v1/tenant/roles",{method:"POST",body:JSON.stringify({
        ...(creatingRole?{}:{roleId:selectedRole?.id}),roleName:roleName.trim(),permissionKeys:rolePermissions
      })});
      setNotice(creatingRole?"Peran khusus berhasil dibuat.":"Hak akses peran berhasil diperbarui.");
      setCreatingRole(false);
      await load();
      if(result.data?.roleId)setSelectedRoleId(result.data.roleId);
    }catch(reason){setError(reason instanceof Error?reason.message:"Gagal menyimpan peran.");}
    finally{setSaving("");}
  };
  const deleteRole=async()=>{
    if(!selectedRole||selectedRole.is_system)return;
    if(!window.confirm(`Hapus peran “${selectedRole.role_name}”? Peran yang masih digunakan anggota tidak dapat dihapus.`))return;
    setSaving("delete");setError("");setNotice("");
    try{
      await request(`/v1/tenant/roles/${selectedRole.id}`,{method:"DELETE"});
      setNotice("Peran khusus berhasil dihapus.");setCreatingRole(false);await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"Gagal menghapus peran.");}
    finally{setSaving("");}
  };
  const addMember=async(event:FormEvent)=>{
    event.preventDefault();setAdding(true);setError("");setNotice("");
    try{
      await request("/v1/tenant/members",{method:"POST",body:JSON.stringify({email:newEmail.trim(),roleKeys:newRoles})});
      setNewEmail("");setNewRoles([]);setNotice("Akun terverifikasi berhasil ditambahkan ke lembaga.");await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"Gagal menambahkan anggota.");}
    finally{setAdding(false);}
  };
  const saveMember=async(member:Member)=>{
    setSaving(member.membership_id);setError("");setNotice("");
    try{
      await request(`/v1/tenant/members/${member.membership_id}/roles`,{method:"PATCH",body:JSON.stringify({roleKeys:drafts[member.membership_id]??[]})});
      setNotice("Penugasan peran anggota berhasil diperbarui.");await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"Gagal menyimpan penugasan peran.");}
    finally{setSaving("");}
  };

  const loadMemberScopes=async(member:Member)=>{
    setScopeLoading(true);setError("");
    try{
      const [scopeResult,targetResult]=await Promise.all([
        request(`/v1/tenant/members/${member.membership_id}/scopes`),
        request("/v1/tenant/scope-targets"),
      ]);
      setMemberScopes((current)=>({...current,[member.membership_id]:{...EMPTY_SCOPES,...scopeResult.data?.scopes}}));
      setScopeTargets({...scopeTargets,...targetResult.data});
      setScopeMemberId(member.membership_id);
    }catch(reason){setError(reason instanceof Error?reason.message:"Gagal memuat cakupan akses anggota.");}
    finally{setScopeLoading(false);}
  };
  const assignScope=async(member:Member)=>{
    if(!scopeTargetId||scopeReason.trim().length<3)return;
    setScopeSaving(true);setError("");setNotice("");
    try{
      await request(`/v1/tenant/members/${member.membership_id}/scopes`,{method:"POST",body:JSON.stringify({
        scopeType,targetId:scopeTargetId,reason:scopeReason.trim(),...(scopeValidUntil?{validUntil:new Date(scopeValidUntil).toISOString()}:{}),
      })});
      setScopeTargetId("");setScopeReason("");setScopeValidUntil("");
      setNotice("Cakupan akses berhasil ditambahkan dan dicatat dalam audit.");
      await loadMemberScopes(member);
    }catch(reason){setError(reason instanceof Error?reason.message:"Gagal menambahkan cakupan akses.");}
    finally{setScopeSaving(false);}
  };
  const revokeScope=async(member:Member,type:ScopeType,assignment:ScopeAssignment)=>{
    if(!window.confirm("Cabut cakupan akses ini? Riwayat akan tetap tersimpan dan tidak dapat dipulihkan."))return;
    setScopeSaving(true);setError("");setNotice("");
    try{
      await request(`/v1/tenant/members/${member.membership_id}/scopes/${assignment.id}/revoke`,{method:"PATCH",body:JSON.stringify({scopeType:type})});
      setNotice("Cakupan akses berhasil dicabut dan dicatat dalam audit.");
      await loadMemberScopes(member);
    }catch(reason){setError(reason instanceof Error?reason.message:"Gagal mencabut cakupan akses.");}
    finally{setScopeSaving(false);}
  };

  return <section className="tenant-access-page">
    <div className="page-heading"><div><span className="eyebrow">PENGELOLAAN AKUN LEMBAGA</span><h1>Pengguna & Jabatan</h1><p>Tambahkan akun ke pesantren, pilih jabatan yang sesuai, lalu atur cakupan tugas bila diperlukan. Hak akses tetap diverifikasi oleh server.</p></div><button className="outline-button" type="button" onClick={()=>void load()} disabled={loading}>Muat ulang</button></div>
    <div className="alert info">Cara cepat: masukkan email akun yang sudah terdaftar dan terverifikasi, pilih satu jabatan, lalu tambahkan. Pengaturan izin teknis dan penugasan rinci tersedia di bagian lanjutan.</div>
    <section className="tenant-add-member" aria-labelledby="my-access-heading">
      <div><span className="eyebrow">IDENTITAS AKSES</span><h2 id="my-access-heading">Peran dan hak akses akun Anda</h2>
        <p>Informasi ini berasal dari keanggotaan aktif pada lembaga yang sedang dibuka. Peran platform dan peran institusi merupakan kewenangan yang berbeda.</p>
      </div>
      <div className="tenant-role-groups">
        <fieldset><legend>Peran aktif</legend><div>
          {institutionRoles.length ? institutionRoles.map((role)=><label key={role}><span><strong>{ROLE_DISPLAY_NAMES[role]??role}</strong><small>{role}</small></span></label>) : <p className="muted">Belum ada peran institusi yang tercatat. Hubungi administrator lembaga.</p>}
        </div></fieldset>
        <fieldset><legend>Ringkasan izin efektif</legend><div>
          <p><strong>{permissions.length}</strong> izin efektif tersedia untuk akun ini.</p>
          {permissions.length ? <details><summary>Lihat daftar izin teknis</summary><ul>{[...permissions].sort().map((permission)=><li key={permission}><code>{permission}</code></li>)}</ul></details> : <p className="muted">Belum ada izin yang diberikan.</p>}
        </div></fieldset>
      </div>
      <p className="muted">Izin tetap dibatasi oleh organisasi, kebijakan API, database/RLS, dan cakupan penugasan yang berlaku. Anda tidak dapat mengubah peran sendiri.</p>
    </section>
    {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
    {loading?<p className="muted">Memuat katalog peran dan anggota…</p>:null}

    {canManageRoles&&<details className="tenant-advanced-settings">
      <summary>Pengaturan lanjutan: matriks izin & peran khusus</summary>
      <section className="tenant-add-member">
        <div><h2>Peran & matriks izin</h2><p>Pilih template bawaan untuk melihat izin, atau buat peran khusus dengan hak akses minimum yang dibutuhkan.</p></div>
        <div className="form-grid">
          <label className="wide-field">Pilih peran
            <select value={creatingRole?"__new__":selectedRoleId} onChange={(event)=>{setCreatingRole(event.target.value==="__new__");setSelectedRoleId(event.target.value==="__new__"?"":event.target.value);setError("");}}>
              <option value="">Pilih peran</option>
              {roles.map((role)=><option key={role.id} value={role.id}>{role.role_name}{role.is_system?" · Template sistem":" · Khusus lembaga"}</option>)}
              {creatingRole&&<option value="__new__">Peran khusus baru</option>}
            </select>
          </label>
          <div className="wide-field"><button type="button" className="outline-button" onClick={startNewRole}>＋ Buat peran khusus</button></div>
        </div>
        {(creatingRole||selectedRole)&&<form onSubmit={saveRole}>
          <label>Nama peran<input value={roleName} onChange={(event)=>setRoleName(event.target.value)} disabled={!editableRole} minLength={2} maxLength={100} required placeholder="Contoh: Operator Data Pendidikan"/></label>
          {selectedRole&&!selectedRole.is_system&&<p className="muted">Kunci peran bersifat tetap agar penugasan anggota tidak terputus.</p>}
          {selectedRole?.is_system&&!creatingRole&&<div className="alert warning">Template bawaan hanya dapat dilihat. Buat peran khusus jika membutuhkan perubahan izin.</div>}
          <div className="tenant-role-groups">
            {groupedPermissions.map(([group,items])=><fieldset key={group}><legend>{GROUP_LABELS[group]??group}</legend><div>{items.map((item)=><label key={item.permission_key} title={item.description}>
              <input type="checkbox" checked={rolePermissions.includes(item.permission_key)} disabled={!editableRole||!item.assignable} onChange={(event)=>toggleRolePermission(item.permission_key,event.target.checked)}/>
              <span><strong>{item.permission_key}</strong><small>{item.description}{!item.assignable?" · Khusus administrator":" "}</small></span>
            </label>)}</div></fieldset>)}
          </div>
          <footer><small>{rolePermissions.length} izin dipilih</small><div>
            {creatingRole&&<button type="button" className="outline-button" onClick={cancelNewRole}>Batal</button>}
            {selectedRole&&!selectedRole.is_system&&!creatingRole&&<button type="button" className="outline-button" onClick={()=>void deleteRole()} disabled={Boolean(saving)}>Hapus peran</button>}
            {editableRole&&<button className="primary" type="submit" disabled={saving==="role"||roleName.trim().length<2}>{saving==="role"?"Menyimpan…":creatingRole?"Buat peran":"Simpan matriks izin"}</button>}
          </div></footer>
        </form>}
      </section>
    </details>}

    {canManageMembers&&<>
      <form className="tenant-add-member" onSubmit={addMember}>
        <div><h2>Tambah pengguna</h2><p>Masukkan email akun PONDOK OS yang sudah dibuat dan diverifikasi oleh calon pengguna. Sistem tidak meminta atau membagikan kata sandi.</p></div>
        <label className="tenant-member-email">Email pengguna<input type="email" value={newEmail} onChange={(event)=>setNewEmail(event.target.value)} placeholder="nama@lembaga.id" required maxLength={254}/></label>
        <label>Jabatan
          <select value={newRoles[0]??""} onChange={(event)=>setNewRoles(event.target.value?[event.target.value]:[])} required>
            <option value="">Pilih jabatan</option>
            {roles.filter((role)=>!["institution_owner","institution_admin"].includes(role.role_key)).map((role)=><option key={role.id} value={role.role_key}>{role.role_name}{role.is_system?" · Jabatan bawaan":" · Khusus lembaga"}</option>)}
          </select>
        </label>
        <p className="muted">Pemilik Institusi dan Admin Pesantren tidak dapat ditetapkan melalui formulir ini. Penetapan jabatan tersebut mengikuti proses otorisasi khusus.</p>
        <footer><small>{newRoles.length ? "1 jabatan dipilih" : "Belum ada jabatan dipilih"}</small><button className="primary" type="submit" disabled={adding||!newEmail.trim()||newRoles.length!==1}>{adding?"Menambahkan…":"Tambahkan pengguna"}</button></footer>
      </form>
      <section className="tenant-member-list"><div className="page-heading"><div><h2>Pengguna pesantren</h2><p>Pemilik dan administrator utama dilindungi dari perubahan melalui layar ini.</p></div></div>
        {members.length===0?<p className="muted">Belum ada anggota terdaftar atau akses daftar anggota tidak tersedia.</p>:members.map((member)=><article className="tenant-member-card" key={member.membership_id}>
          <header><div><strong>Anggota lembaga</strong><small>ID akun: {member.user_id}</small><small>Status: {member.membership_status}</small></div><span className="member-current-roles">{member.roles.map((key)=>roles.find((role)=>role.role_key===key)?.role_name??key).join(" · ")||"Belum ada peran"}</span></header>
          <details className="tenant-member-advanced">
            <summary>Pengaturan lanjutan: jabatan & cakupan tugas</summary>
            <div className="tenant-scope-tools">
            <button type="button" className="outline-button" disabled={scopeLoading} onClick={()=>scopeMemberId===member.membership_id?setScopeMemberId(""):void loadMemberScopes(member)}>
              {scopeMemberId===member.membership_id?"Tutup cakupan akses":"Atur cakupan akses"}
            </button>
            {scopeMemberId===member.membership_id&&<div className="tenant-add-member">
              <h3>Cakupan akses operasional</h3>
              <p>Batasi tugas anggota ke kampus, unit, kelas, penawaran mapel, asrama, atau kamar tertentu. Penugasan berlaku sebagai batas tambahan; izin peran tetap diperlukan.</p>
              <div className="form-grid">
                <label>Jenis cakupan<select value={scopeType} onChange={(event)=>{setScopeType(event.target.value as ScopeType);setScopeTargetId("");}}>
                  {(Object.keys(SCOPE_LABELS) as ScopeType[]).map((type)=><option key={type} value={type}>{SCOPE_LABELS[type]}</option>)}
                </select></label>
                <label>Target<select value={scopeTargetId} onChange={(event)=>setScopeTargetId(event.target.value)} required>
                  <option value="">Pilih target</option>
                  {(scopeTargets[scopeType]??[]).map((target)=><option key={target.target_id} value={target.target_id}>{target.label}</option>)}
                </select></label>
                <label>Alasan penugasan<input value={scopeReason} onChange={(event)=>setScopeReason(event.target.value)} minLength={3} maxLength={500} placeholder="Contoh: Penanggung jawab unit putra" required/></label>
                <label>Berlaku sampai (opsional)<input type="datetime-local" value={scopeValidUntil} onChange={(event)=>setScopeValidUntil(event.target.value)}/></label>
              </div>
              <button type="button" className="primary" disabled={scopeSaving||!scopeTargetId||scopeReason.trim().length<3} onClick={()=>void assignScope(member)}>{scopeSaving?"Menyimpan…":"Tambahkan cakupan"}</button>
              <div className="tenant-scope-list">
                {(Object.keys(SCOPE_LABELS) as ScopeType[]).map((type)=>{
                  const entries=memberScopes[member.membership_id]?.[type]??[];
                  return <section key={type}><h4>{SCOPE_LABELS[type]}</h4>
                    {entries.length===0?<p className="muted">Belum ada penugasan.</p>:entries.map((entry)=><div className="tenant-scope-row" key={entry.id}>
                      <span><strong>{scopeTargets[type]?.find((target)=>target.target_id===entry.target_id)?.label??entry.target_id}</strong><small>{entry.reason} · {entry.revoked_at?"Dicabut":entry.valid_until?new Date(entry.valid_until).toLocaleString("id-ID"):"Tanpa batas akhir"}</small></span>
                      {!entry.revoked_at&&<button type="button" className="outline-button" disabled={scopeSaving} onClick={()=>void revokeScope(member,type,entry)}>Cabut</button>}
                    </div>)}
                  </section>;
                })}
              </div>
            </div>}
          </div>
          {member.roles.some((role)=>["institution_owner","institution_admin"].includes(role))?<div className="alert warning">Akun pemilik / administrator utama dilindungi dan tidak dapat diubah melalui layar ini.</div>:<>
            <div className="tenant-role-groups">{ROLE_GROUPS.map((group)=><fieldset key={group.title}><legend>{group.title}</legend><div>{group.keys.map((key)=>{
              const role=roles.find((item)=>item.role_key===key);if(!role)return null;
              return <label key={key}><input type="checkbox" checked={(drafts[member.membership_id]??member.roles).includes(key)} onChange={(event)=>toggleMemberRole(member.membership_id,key,event.target.checked)}/><span>{role.role_name}</span></label>;
            })}</div></fieldset>)}{roles.some((role)=>!role.is_system)&&<fieldset key="tenant-custom-roles"><legend>Peran khusus lembaga</legend><div>{roles.filter((role)=>!role.is_system).map((role)=><label key={role.id}><input type="checkbox" checked={(drafts[member.membership_id]??member.roles).includes(role.role_key)} onChange={(event)=>toggleMemberRole(member.membership_id,role.role_key,event.target.checked)}/><span>{role.role_name}</span></label>)}</div></fieldset>}</div>
            <footer><small>{(drafts[member.membership_id]??member.roles).length} peran dipilih</small><button className="primary" type="button" disabled={Boolean(saving)||JSON.stringify([...(drafts[member.membership_id]??member.roles)].sort())===JSON.stringify([...member.roles].sort())} onClick={()=>void saveMember(member)}>{saving===member.membership_id?"Menyimpan…":"Simpan penugasan"}</button></footer>
          </>}
          </details>
        </article>)}
      </section>
    </>}
    {!canManageRoles&&!canManageMembers&&<div className="alert info">Mode baca saja. Anda dapat melihat peran dan izin akun sendiri, tetapi tidak dapat mengubah peran, mengundang anggota, atau mengatur cakupan akses. Hubungi Pemilik Institusi/Admin Pesantren jika memerlukan perubahan.</div>}
  </section>;
}
