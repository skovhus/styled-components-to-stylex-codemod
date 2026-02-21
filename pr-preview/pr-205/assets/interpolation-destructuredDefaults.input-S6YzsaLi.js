import{j as e,a as n}from"./index-K_nkAAOe.js";const s=n.button`
  color: ${({color:r="hotpink"})=>r||"blue"};
`,o=n.div`
  padding: ${({size:r=16})=>r===16?"1rem":`${r}px`};
`,i=n.div`
  margin: ${({margin:r=10})=>r||5}px;
`,d=()=>e.jsxs(e.Fragment,{children:[e.jsx(s,{children:"Default (should be hotpink)"}),e.jsx(s,{color:"",children:"Empty string (should be blue)"}),e.jsx(s,{color:"red",children:"Red"}),e.jsx(o,{children:"Default size (should be 1rem)"}),e.jsx(o,{size:16,children:"Size 16 (should be 1rem)"}),e.jsx(o,{size:24,children:"Size 24 (should be 24px)"}),e.jsx(i,{children:"Default (should be 10px)"}),e.jsx(i,{margin:0,children:"Zero (should be 5px)"}),e.jsx(i,{margin:20,children:"20px"})]});export{d as App};
