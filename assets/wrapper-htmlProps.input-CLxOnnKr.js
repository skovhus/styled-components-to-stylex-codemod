import{j as i,a as s}from"./index-Pee1c3Zl.js";const e=s.label`
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: ${t=>t.$disabled?.5:1};
`,o=()=>i.jsxs("div",{children:[i.jsxs(e,{title:"This is a tooltip",$disabled:!1,onClick:()=>console.log("clicked"),children:[i.jsx("input",{type:"checkbox"}),"Option 1"]}),i.jsxs(e,{$disabled:!0,title:"Disabled option",children:[i.jsx("input",{type:"checkbox",disabled:!0}),"Option 2"]})]});export{o as App};
