import{j as t,c as o}from"./index-B2uPh2kr.js";const e=o.button`
  background: #bf4f74 !important;
  color: white !important;
  border: none !important;
  padding: 8px 16px;
  border-radius: 4px;
`,n=o.div`
  width: 100% !important;
  max-width: 500px !important;
  margin: 0 auto;
`,i=o.p`
  font-size: 16px;
  color: #333 !important;
  line-height: 1.5;
  margin: 0 !important;
`,d=o.a`
  color: #bf4f74;
  text-decoration: none;

  &:hover {
    color: #4f74bf !important;
    text-decoration: underline !important;
  }
`,a=o.span`
  color: ${r=>r.theme.color.labelMuted} !important;
  font-size: 10px !important;
`,l=()=>t.jsxs("div",{children:[t.jsx(e,{style:{background:"blue"},children:"Should be pink despite inline style"}),t.jsx(n,{children:"Full width content"}),t.jsx(i,{style:{color:"red",margin:"20px"},children:"Color and margin should be overridden"}),t.jsx(d,{href:"#",children:"Hover me"}),t.jsx(a,{children:"Override text"})]});export{l as App};
