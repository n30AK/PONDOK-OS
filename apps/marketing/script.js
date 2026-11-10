const toggle=document.querySelector(".menu-toggle");
const links=document.querySelector(".nav-links");
if(toggle&&links){
  const closeMenu=()=>{
    links.classList.remove("open");
    toggle.setAttribute("aria-expanded","false");
    toggle.setAttribute("aria-label","Buka menu");
  };
  toggle.addEventListener("click",()=>{
    const open=links.classList.toggle("open");
    toggle.setAttribute("aria-expanded",String(open));
    toggle.setAttribute("aria-label",open?"Tutup menu":"Buka menu");
  });
  links.querySelectorAll("a").forEach(a=>a.addEventListener("click",closeMenu));
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape")closeMenu();
  });
  document.addEventListener("click",event=>{
    if(!links.contains(event.target)&&!toggle.contains(event.target))closeMenu();
  });
  window.addEventListener("resize",()=>{
    if(window.innerWidth>820)closeMenu();
  });
}
const year=document.querySelector("#year");
if(year)year.textContent=String(new Date().getFullYear());
