import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getAccessToken } from "./auth";

type Member = { membership_id: string; user_id: string; membership_status: string; roles: string[]; role_names: string[] };
type Role = { id: string; role_key: string; role_name: string; is_system: boolean; organization_id: string | null; permission_keys: string[] };
type Permission = { permission_key: string; description: string; assignable: boolean };
type Props = { organizationId: string; permissions: string[] };

const ROLE_GROUPS = [
  { title: "Yayasan & Pimpinan", keys: ["foundation_chair","foundation_secretary","foundation_treasurer","pondok_leader","pondok_deputy","pondok_secretary","pondok_treasurer"] },
  { title: "Pendidikan & Kesantrian", keys: ["academic_coordinator","school_principal","homeroom_teacher","teacher","student_affairs_coordinator","musyrif","safeguarding_officer"] },
  { title: "Layanan & Operasional", keys: ["finance_cashier","finance_verifier","procurement_officer","warehouse_staff","hr_officer","librarian","admission_officer","inventory_manager","boarding_supervisor","cms_editor","health_officer"] },
  { title: "Pengawasan", keys: ["read_only_auditor"] },
];
const GROUP_LABELS: Record<string,string> = {
  academic:"Akademik & data santri", admissions:"PPDB", assets:"Aset", audit:"Audit", boarding:"Asrama & kesantrian",
  cms:"Website & publikasi", core:"Tata kelola", crm:"CRM, alumni & donatur", finance:"Keuangan & akuntansi",
  hr:"SDM, pengajar & payroll", inventory:"Inventaris & gudang", library:"Perpustakaan", procurement:"Pengadaan",
  reports:"Laporan", settings:"Pengaturan", sync:"Sinkronisasi",
};

export default function TenantAccessAdmin({ organizationId, permissions }: Props) {
  const canManageMembers = permissions.includes("core.members.manage");
  const canManageRoles = permissions.includes("core.roles.manage");
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
  const toggleNewRole=(key:string,checked:boolean)=>setNewRoles((current)=>checked?[...current,key]:current.filter((item)=>item!==key));
  const saveMember=async(member:Member)=>{
    setSaving(member.membership_id);setError("");setNotice("");
    try{
      await request(`/v1/tenant/members/${member.membership_id}/roles`,{method:"PATCH",body:JSON.stringify({roleKeys:drafts[member.membership_id]??[]})});
      setNotice("Penugasan peran anggota berhasil diperbarui.");await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"Gagal menyimpan penugasan peran.");}
    finally{setSaving("");}
  };

  return <section className="tenant-access-page">
    <div className="page-heading"><div><span className="eyebrow">TATA KELOLA ORGANISASI</span><h1>Jabatan, peran & hak akses</h1><p>Kelola peran kerja, izin setiap modul, dan penugasan anggota. Hak akses tetap diperiksa oleh API dan database, bukan hanya disembunyikan dari menu.</p></div><button className="outline-button" type="button" onClick={()=>void load()} disabled={loading}>Muat ulang</button></div>
    <div className="alert info">Peran bawaan merupakan template sistem dan tidak dapat diubah. Buat peran khusus untuk menyesuaikan kewenangan lembaga. Izin administrasi anggota, pengelolaan peran, konfigurasi lembaga, dan kontrol sinkronisasi tidak dapat diberikan melalui peran khusus.</div>
    {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
    {loading?<p className="muted">Memuat katalog peran dan anggota…</p>:null}

    {canManageRoles&&<>
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
    </>}

    {canManageMembers&&<>
      <form className="tenant-add-member" onSubmit={addMember}>
        <div><h2>Tambah anggota lembaga</h2><p>Masukkan email akun PONDOK OS yang sudah terdaftar dan diverifikasi. Peran khusus lembaga juga dapat langsung diberikan.</p></div>
        <label className="tenant-member-email">Email akun<input type="email" value={newEmail} onChange={(event)=>setNewEmail(event.target.value)} placeholder="nama@lembaga.id" required maxLength={254}/></label>
        <div className="tenant-role-groups">{ROLE_GROUPS.map((group)=><fieldset key={group.title}><legend>{group.title}</legend><div>{group.keys.map((key)=>{
          const role=roles.find((item)=>item.role_key===key);if(!role)return null;
          return <label key={key}><input type="checkbox" checked={newRoles.includes(key)} onChange={(event)=>toggleNewRole(key,event.target.checked)}/><span>{role.role_name}</span></label>;
        })}</div></fieldset>)}{roles.some((role)=>!role.is_system)&&<fieldset key="tenant-custom-roles"><legend>Peran khusus lembaga</legend><div>{roles.filter((role)=>!role.is_system).map((role)=><label key={role.id}><input type="checkbox" checked={newRoles.includes(role.role_key)} onChange={(event)=>toggleNewRole(role.role_key,event.target.checked)}/><span>{role.role_name}</span></label>)}</div></fieldset>}</div>
        <footer><small>{newRoles.length} peran dipilih</small><button className="primary" type="submit" disabled={adding||!newEmail.trim()||newRoles.length===0}>{adding?"Menambahkan…":"Tambah anggota & tetapkan peran"}</button></footer>
      </form>
      <section className="tenant-member-list"><div className="page-heading"><div><h2>Anggota & penugasan</h2><p>Anggota pemilik dan administrator utama dilindungi dari perubahan melalui layar ini.</p></div></div>
        {members.length===0?<p className="muted">Belum ada anggota terdaftar atau akses daftar anggota tidak tersedia.</p>:members.map((member)=><article className="tenant-member-card" key={member.membership_id}>
          <header><div><strong>Anggota lembaga</strong><small>ID akun: {member.user_id}</small><small>Status: {member.membership_status}</small></div><span className="member-current-roles">{member.roles.map((key)=>roles.find((role)=>role.role_key===key)?.role_name??key).join(" · ")||"Belum ada peran"}</span></header>
          {member.roles.some((role)=>["institution_owner","institution_admin"].includes(role))?<div className="alert warning">Akun pemilik / administrator utama dilindungi dan tidak dapat diubah melalui layar ini.</div>:<>
            <div className="tenant-role-groups">{ROLE_GROUPS.map((group)=><fieldset key={group.title}><legend>{group.title}</legend><div>{group.keys.map((key)=>{
              const role=roles.find((item)=>item.role_key===key);if(!role)return null;
              return <label key={key}><input type="checkbox" checked={(drafts[member.membership_id]??member.roles).includes(key)} onChange={(event)=>toggleMemberRole(member.membership_id,key,event.target.checked)}/><span>{role.role_name}</span></label>;
            })}</div></fieldset>)}{roles.some((role)=>!role.is_system)&&<fieldset key="tenant-custom-roles"><legend>Peran khusus lembaga</legend><div>{roles.filter((role)=>!role.is_system).map((role)=><label key={role.id}><input type="checkbox" checked={(drafts[member.membership_id]??member.roles).includes(role.role_key)} onChange={(event)=>toggleMemberRole(member.membership_id,role.role_key,event.target.checked)}/><span>{role.role_name}</span></label>)}</div></fieldset>}</div>
            <footer><small>{(drafts[member.membership_id]??member.roles).length} peran dipilih</small><button className="primary" type="button" disabled={Boolean(saving)||JSON.stringify([...(drafts[member.membership_id]??member.roles)].sort())===JSON.stringify([...member.roles].sort())} onClick={()=>void saveMember(member)}>{saving===member.membership_id?"Menyimpan…":"Simpan penugasan"}</button></footer>
          </>}
        </article>)}
      </section>
    </>}
    {!canManageRoles&&!canManageMembers&&<div className="alert warning">Akun Anda belum memiliki izin untuk mengelola peran atau anggota lembaga.</div>}
  </section>;
}
