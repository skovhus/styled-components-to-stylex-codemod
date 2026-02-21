import{j as i,a as n}from"./index-FmeMs9yF.js";const t="#ff0000",r="#0000ff",a="#00ff00",e=n.div`
  background: linear-gradient(${t}, ${r});
  width: 200px;
  height: 100px;
`,o=n.div`
  background: radial-gradient(${t}, ${r});
  width: 200px;
  height: 100px;
`,d=n.div`
  background: conic-gradient(${t}, ${r}, ${a});
  width: 200px;
  height: 100px;
`,c=n.div`
  background: repeating-linear-gradient(${t} 0%, ${r} 10%);
  width: 200px;
  height: 100px;
`,s=()=>i.jsxs(i.Fragment,{children:[i.jsx(e,{children:"Linear"}),i.jsx(o,{children:"Radial"}),i.jsx(d,{children:"Conic"}),i.jsx(c,{children:"Repeating"})]});export{s as App};
