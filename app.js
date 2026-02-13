import { auth, provider, cloudSave, cloudLoad } from "./firebase.js";
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {

  const monthSelect = document.getElementById("monthSelect");
  const yearInput = document.getElementById("yearInput");
  const tableContainer = document.getElementById("tableContainer");
  const statusText = document.getElementById("statusText");

  let data = JSON.parse(localStorage.getItem("taskData")) || [];
  let currentUser = null;

  const today = new Date();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  months.forEach((m,i)=>{
    const o=document.createElement("option");
    o.value=i+1;
    o.textContent=m;
    monthSelect.appendChild(o);
  });

  monthSelect.value = today.getMonth()+1;
  yearInput.value = today.getFullYear();

  function daysInMonth(y,m){return new Date(y,m,0).getDate();}
  function saveLocal(){localStorage.setItem("taskData",JSON.stringify(data));}
  function autoSync(){ if(currentUser) cloudSave(currentUser.uid,data); }

  function getMonthData(y,m){
    let f=data.find(d=>d.year===y&&d.month===m);
    if(!f){f={year:y,month:m,tasks:[]};data.push(f);}
    return f;
  }

  function addTask(){
    const input=document.getElementById("taskInput");
    if(!input.value.trim())return;
    const y=Number(yearInput.value),m=Number(monthSelect.value);
    const md=getMonthData(y,m);
    const days=daysInMonth(y,m);
    const checklist={};
    for(let d=1;d<=days;d++)checklist[d]="";
    md.tasks.push({name:input.value,checklist});
    input.value="";
    saveLocal();
    autoSync();
    render();
  }

  function toggleCheck(t,d){
    const y=Number(yearInput.value),m=Number(monthSelect.value);
    const md=getMonthData(y,m);
    const val=md.tasks[t].checklist[d];
    md.tasks[t].checklist[d]=val===""?"✔":val==="✔"?"✖":"";
    saveLocal();
    autoSync();
    render();
  }

  function deleteTask(i){
    const y=Number(yearInput.value),m=Number(monthSelect.value);
    const md=getMonthData(y,m);
    md.tasks.splice(i,1);
    saveLocal();
    autoSync();
    render();
  }

  function render(){
    const y=Number(yearInput.value),m=Number(monthSelect.value);
    const md=getMonthData(y,m);
    const days=daysInMonth(y,m);

    let html="<table><thead><tr><th class='task-col'>Task</th>";
    for(let d=1;d<=days;d++)html+=`<th>${d}</th>`;
    html+="</tr></thead><tbody>";

    md.tasks.forEach((t,i)=>{
      html+=`<tr><td class="task-col">${t.name} <button data-i="${i}" class="del">✕</button></td>`;
      for(let d=1;d<=days;d++){
        const val=t.checklist[d];
        const cls=val==="✔"?"done":val==="✖"?"missed":"";
        html+=`<td class="${cls}" data-t="${i}" data-d="${d}">${val}</td>`;
      }
      html+="</tr>";
    });

    html+="</tbody></table><div class='mobile-list'></div>";
    tableContainer.innerHTML=html;

    document.querySelectorAll("td[data-t]").forEach(c=>{
      c.onclick=()=>toggleCheck(Number(c.dataset.t),Number(c.dataset.d));
    });

    document.querySelectorAll(".del").forEach(b=>{
      b.onclick=()=>deleteTask(Number(b.dataset.i));
    });
  }

  // AUTH STATE
  onAuthStateChanged(auth, async (user)=>{
    if(user){
      currentUser=user;
      statusText.textContent="Signed in as "+user.email;
      const cloud=await cloudLoad(user.uid);
      if(cloud){data=cloud;saveLocal();}
      render();
    }else{
      currentUser=null;
      statusText.textContent="Not signed in";
    }
  });

  document.getElementById("loginBtn").onclick=()=>{
    signInWithPopup(auth,provider);
  };

  document.getElementById("logoutBtn").onclick=()=>{
    signOut(auth);
  };

  document.getElementById("addTaskBtn").onclick=addTask;
  document.getElementById("generateMonthBtn").onclick=render;
  document.getElementById("viewToggle").onclick=()=>{
    document.body.classList.toggle("mobile-view");
  };

  render();
});
