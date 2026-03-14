import{j as i,c as n}from"./index-BZdvn_zz.js";const e=n.div`
  display: none;

  @container sidebar (min-width: 300px) {
    display: flex;
  }
`,s=n.div`
  container-name: sidebar;
  container-type: inline-size;
  width: 100%;
  border: 1px solid #ccc;
  padding: 16px;
`,o=()=>i.jsx(s,{children:i.jsx(e,{children:"Visible when container > 300px"})});export{o as App};
