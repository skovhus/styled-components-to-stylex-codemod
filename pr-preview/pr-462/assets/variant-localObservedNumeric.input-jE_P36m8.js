import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t}from"./index-BITDY2OD.js";var n=e(),r=t.div`
  width: 120px;
  height: ${({height:e})=>e};
  padding: 8px;
  background-color: tomato;
  color: white;
`,i=t.div`
  width: 120px;
  height: ${({$height:e})=>e};
  padding: 8px;
  background-color: royalblue;
  color: white;
`,a=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,gap:12,padding:16},children:[(0,n.jsx)(r,{height:40,children:`Regular 40`}),(0,n.jsx)(r,{height:80,children:`Regular 80`}),(0,n.jsx)(i,{$height:50,children:`Transient 50`}),(0,n.jsx)(i,{$height:90,children:`Transient 90`})]});export{a as App,r as Panel,i as TransientPanel};