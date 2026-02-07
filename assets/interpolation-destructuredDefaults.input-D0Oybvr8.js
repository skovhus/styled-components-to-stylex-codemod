import{j as e,d as i}from"./index-BMWzaOvC.js";const s=i.button`
  color: ${({color:r="hotpink"})=>r||"blue"};
`,o=i.div`
  padding: ${({size:r=16})=>r===16?"1rem":`${r}px`};
`,d=i.div`
  margin: ${({margin:r=10})=>r||5}px;
`,l=()=>e.jsxs(e.Fragment,{children:[e.jsx(s,{children:"Default (should be hotpink)"}),e.jsx(s,{color:"",children:"Empty string (should be blue)"}),e.jsx(s,{color:"red",children:"Red"}),e.jsx(o,{children:"Default size (should be 1rem)"}),e.jsx(o,{size:16,children:"Size 16 (should be 1rem)"}),e.jsx(o,{size:24,children:"Size 24 (should be 24px)"}),e.jsx(d,{children:"Default (should be 10px)"}),e.jsx(d,{margin:0,children:"Zero (should be 5px)"}),e.jsx(d,{margin:20,children:"20px"})]});export{l as App};
