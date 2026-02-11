import { auth, provider, cloudSave, cloudLoad } from "./firebase.js";
import { signInWithPopup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  const monthSelect = document.getElementById("monthSelect");
  const yearInput = document.getElementById("yearInput");
  const tableContainer = document.getElementById("tableContainer");
  const addTaskBtn = document.getElementById("addTaskBtn");
  const generateMonthBtn = document.getElementById("generateMonthBtn");
  const loginBtn = document.getElementById("loginBtn");
  const syncBtn = document.getElementById("syncBtn");
  const viewToggle = document.getElementById("viewToggle");

  let data = JSON.parse(localStorage.getItem("taskData")) || [];
  let user = null;

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  months.forEach((m,i)=>{const o=document.createElement("option");o.value=i+1;o.textContent=m;monthSelect.appendChild(o);});
  monthSelect.value = today.getMonth()+1;
  yearInput.value = today.getFullYear();

  function daysInMonth(y,m){return new Date(y,m,0).getDate();}
  function save(){localStorage.setItem("taskData",JSON.stringify(data));render();}
  function getMonthData(y,m){let f=data.find(d=>d.year===y&&d.month===m);if(!f){f={year:y,month:m,tasks:[]};data.push(f);}return f;}

  function addTask(){
    const input=document.getElementById("taskInput");
    if(!input.value.trim())return;
    const y=Number(yearInput.value),m=Number(monthSelect.value);
    const md=getMonthData(y,m),days=daysInMonth(y,m),checklist={};
    for(let d=1;d<=days;d++)checklist[d]="";
    md.tasks.push({name:input.value,checklist});input.value="";save();
  }

  function deleteTask(i){const y=Number(yearInput.value),m=Number(monthSelect.value),md=getMonthData(y,m);if(!confirm("Delete this task?"))return;md.tasks.splice(i,1);save();}
  function toggleCheck(t,d){const y=Number(yearInput.value),m=Number(monthSelect.value),md=getMonthData(y,m);const val=md.tasks[t].checklist[d];md.tasks[t].checklist[d]=val===""?"✔":val==="✔"?"✖":"";save();}
  function updateProgress(md,days){let total=0,done=0;md.tasks.forEach(t=>{for(let d=1;d<=days;d++){if(t.checklist[d]!==""){total++;if(t.checklist[d]==="✔")done++;}}});const pct=total===0?0:Math.round(done/total*100);document.getElementById("progressText").innerText=`Completed ${done} of ${total} — ${pct}%`;document.getElementById("progressBar").style.width=pct+"%";}

  function render(){
    const y=Number(yearInput.value),m=Number(monthSelect.value),md=getMonthData(y,m),days=daysInMonth(y,m);
    let html="<table><thead><tr><th class='task-col'>Task</th>";
    for(let d=1;d<=days;d++)html+=`<th>${m}/${d}</th>`;html+="</tr></thead><tbody>";
    md.tasks.forEach((t,i)=>{
      html+=`<tr><td class="task-col">${t.name}<button class="danger delete-btn" data-i="${i}">✕</button></td>`;
      for(let d=1;d<=days;d++){
        const future=new Date(y,m-1,d)>today;
        const val=t.checklist[d];let cls=val==="✔"?"done":val==="✖"?"missed":"";if(future)cls+=" future";
        html+=`<td class="${cls}" data-t="${i}" data-d="${d}">${val}</td>`;
      }html+="</tr>";
    });
    html+="</tbody></table><div class='mobile-list'></div>";tableContainer.innerHTML=html;

    document.querySelectorAll(".delete-btn").forEach(b=>{b.onclick=e=>{e.stopPropagation();deleteTask(Number(b.dataset.i));}});
    document.querySelectorAll("td[data-t]").forEach(c=>{c.onclick=()=>{const t=Number(c.dataset.t),d=Number(c.dataset.d);if(new Date(y,m-1,d)>today)return;toggleCheck(t,d);};});

    const mobile=tableContainer.querySelector(".mobile-list");
    const todayDay=today.getDate();
    md.tasks.forEach((t,i)=>{
      const div=document.createElement("div");div.className="mobile-task";
      const span=document.createElement("span");span.textContent=t.name;div.appendChild(span);
      const btnCheck=document.createElement("button");btnCheck.textContent="✔";btnCheck.onclick=()=>toggleCheck(i,todayDay);div.appendChild(btnCheck);
      const btnMiss=document.createElement("button");btnMiss.textContent="✖";btnMiss.onclick=()=>toggleCheck(i,todayDay);div.appendChild(btnMiss);
      mobile.appendChild(div);
    });

    updateProgress(md,days);
  }

  loginBtn.onclick=async()=>{const res=await signInWithPopup(auth,provider);user=res.user;alert("Signed in as "+user.email);const cloud=await cloudLoad(user.uid);if(cloud){data=cloud;save();}};
  syncBtn.onclick=async()=>{if(!user)return alert("Sign in first");await cloudSave(user.uid,data);alert("Synced!");};
  viewToggle.onclick=()=>{document.body.classList.toggle("mobile-view");};
  addTaskBtn.onclick=addTask;generateMonthBtn.onclick=render;monthSelect.onchange=render;yearInput.onchange=render;
  render();
});
