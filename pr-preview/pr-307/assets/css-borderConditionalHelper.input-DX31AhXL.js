import{j as o,c as d}from"./index-4Xa_ODwx.js";import{b as i}from"./helpers-WeJExOpv.js";const e=d.div`
  padding: 8px;
  border: ${r=>r.$bordered?i("blue"):"none"};
  width: 60px;
  height: 30px;
`,t=d.div`
  padding: 8px;
  border: ${r=>r.position!=="free"?i("transparent"):"none"};
  ${r=>r.position==="top"?"border-bottom-width: 0; border-top-left-radius: 6px; border-top-right-radius: 6px;":"border-top-width: 0; border-bottom-left-radius: 6px; border-bottom-right-radius: 6px;"}
  width: 60px;
  height: 30px;
`,n=()=>o.jsxs("div",{style:{display:"flex",gap:"10px",padding:"10px"},children:[o.jsx(e,{$bordered:!0,children:"Bordered"}),o.jsx(e,{children:"Not Bordered"}),o.jsx(t,{position:"top",children:"Top"}),o.jsx(t,{position:"bottom",children:"Bottom"}),o.jsx(t,{position:"free",children:"Free"})]});export{n as App};
