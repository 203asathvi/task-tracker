import { auth, provider, cloudSave, cloudLoad } from "./firebase.js";
import {
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let data = JSON.parse(localStorage.getItem("taskData")) || [];
let currentUser = null;

const today = new Date();

document.addEventListener("DOMContentLoaded", async () => {
  const monthSelect = document.getElementById("monthSelect");
  const yearInput = document.getElementById("yearInput");
  const tableContainer = document.getElementById("tableContainer");
  const statusText = document.getElementById("statusText");

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  months.forEach((m,i)=>{
    const opt = document.createElement("option");
    opt.value = i+1;
    opt.textContent = m;
    monthSelect.appendChild(opt);
  });
  monthSelect.value = today.getMonth() + 1;
  yearInput.value = today.getFullYear();

  function daysInMonth(y,m){ return new Date(y,m,0).getDate(); }
  function saveLocal(){ localStorage.setItem("taskData", JSON.stringify(data)); }

  function autoSync(){
    if(currentUser){
      cloudSave(currentUser.uid, data).catch(console.error);
    }
  }

  function getMonthData(y,m){
    let found = data.find(d=>d.year===y && d.month===m);
    if(!found){
      found = { year:y, month:m, tasks:[] };
      data.push(found);
    }
    return found;
  }

  function addTask(){
    const input=document.getElementById("taskInput");
    if(!input.value.trim()) return;

    const y=Number(yearInput.value);
    const m=Number(monthSelect.value);
    const md=getMonthData(y,m);
    const days=daysInMonth(y,m);
    const checklist={};
    for(let d=1;d<=days;d++) checklist[d]="";

    md.tasks.push({ name: input.value, checklist });
    input.value = "";
    saveLocal(); autoSync(); render();
  }

  function toggleCheck(t,d){
    const y=Number(yearInput.value);
    const m=Number(monthSelect.value);
    const md=getMonthData(y,m);
    const val=md.tasks[t].checklist[d];
    md.tasks[t].checklist[d]=val===""?"✔":val==="✔"?"✖":"";
    saveLocal(); autoSync(); render();
  }

  function deleteTask(i){
    const y=Number(yearInput.value);
    const m=Number(monthSelect.value);
    const md=getMonthData(y,m);
    md.tasks.splice(i,1);
    saveLocal(); autoSync(); render();
  }

  function updateProgress(md,days){
    let total=0,done=0;
    md.tasks.forEach(t=>{for(let d=1;d<=days;d++){if(t.checklist[d]!==""){total++; if(t.checklist[d]==="✔") done++;}}});
    const pct=total===0?0:Math.round(done/total*100);
    document.getElementById("progressText").innerText=`Completed ${done} of ${total} — ${pct}%`;
    document.getElementById("progressBar").style.width=pct+"%";
  }

  function render(){
    const y=Number(yearInput.value);
    const m=Number(monthSelect.value);
    const md=getMonthData(y,m);
    const days=daysInMonth(y,m);

    let html="<table><thead><tr><th class='task-col'>Task</th>";
    for(let d=1;d<=days;d++) html+=`<th>${d}</th>`;
    html+="</tr></thead><tbody>";

    md.tasks.forEach((t,i)=>{
      html+=`<tr><td class="task-col">
        ${t.name} <button class="danger del" data-i="${i}">✕</button>
      </td>`;
      for(let d=1;d<=days;d++){
        const val=t.checklist[d];
        const cls=val==="✔"?"done":val==="✖"?"missed":"";
        html+=`<td class="${cls}" data-t="${i}" data-d="${d}">${val}</td>`;
      }
      html+="</tr>";
    });

    html+="</tbody></table>";
    tableContainer.innerHTML=html;

    document.querySelectorAll("td[data-t]").forEach(c=>{
      c.onclick=()=>{toggleCheck(Number(c.dataset.t),Number(c.dataset.d));};
    });
    document.querySelectorAll(".del").forEach(b=>{b.onclick=()=>{deleteTask(Number(b.dataset.i));}});
    
    updateProgress(md,days);
  }

  // 🔹 MOBILE SAFE REDIRECT HANDLING
  try {
    const result = await getRedirectResult(auth);
    if(result?.user){
      currentUser = result.user;
      statusText.textContent = "Signed in as "+currentUser.email;
      const cloud = await cloudLoad(currentUser.uid);
      if(cloud){ data=cloud; saveLocal(); }
      render();
    }
  } catch(err){ console.error("Redirect error:", err); }

  // 🔹 AUTH STATE CHANGES
  onAuthStateChanged(auth, async user=>{
    if(user){
      currentUser=user;
      statusText.textContent="Signed in as "+user.email;
      const cloud=await cloudLoad(user.uid);
      if(cloud){ data=cloud; saveLocal(); render(); }
    } else {
      currentUser=null;
      statusText.textContent="Not signed in";
    }
  });

  document.getElementById("loginBtn").onclick = ()=>{
    signInWithRedirect(auth,provider);
  };
  document.getElementById("logoutBtn").onclick = async ()=>{
    await signOut(auth);
    currentUser=null;
    statusText.textContent="Not signed in";
  };

  document.getElementById("addTaskBtn").onclick = addTask;
  document.getElementById("generateMonthBtn").onclick = render;
  monthSelect.onchange=render;
  yearInput.onchange=render;

  render();
});
