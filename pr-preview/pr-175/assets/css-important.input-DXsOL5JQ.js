import{j as t,a as o}from"./index-BI_LmLER.js";const r=o.button`
  background: #bf4f74 !important;
  color: white !important;
  border: none !important;
  padding: 8px 16px;
  border-radius: 4px;
`,n=o.div`
  width: 100% !important;
  max-width: 500px !important;
  margin: 0 auto;
`,e=o.p`
  font-size: 16px;
  color: #333 !important;
  line-height: 1.5;
  margin: 0 !important;
`,i=o.a`
  color: #bf4f74;
  text-decoration: none;

  &:hover {
    color: #4f74bf !important;
    text-decoration: underline !important;
  }
`,a=()=>t.jsxs("div",{children:[t.jsx(r,{style:{background:"blue"},children:"Should be pink despite inline style"}),t.jsx(n,{children:"Full width content"}),t.jsx(e,{style:{color:"red",margin:"20px"},children:"Color and margin should be overridden"}),t.jsx(i,{href:"#",children:"Hover me"})]});export{a as App};
