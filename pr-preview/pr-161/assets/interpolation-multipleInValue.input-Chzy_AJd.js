import{j as i,d as n}from"./index-CNtKh6BA.js";const t="#ff0000",r="#0000ff",e="#00ff00",d=n.div`
  background: linear-gradient(${t}, ${r});
  width: 200px;
  height: 100px;
`,a=n.div`
  background: radial-gradient(${t}, ${r});
  width: 200px;
  height: 100px;
`,o=n.div`
  background: conic-gradient(${t}, ${r}, ${e});
  width: 200px;
  height: 100px;
`,c=n.div`
  background: repeating-linear-gradient(${t} 0%, ${r} 10%);
  width: 200px;
  height: 100px;
`,s=()=>i.jsxs(i.Fragment,{children:[i.jsx(d,{children:"Linear"}),i.jsx(a,{children:"Radial"}),i.jsx(o,{children:"Conic"}),i.jsx(c,{children:"Repeating"})]});export{s as App};
