import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t}from"./index-BVHlTX5E.js";var n=e(),r=t.div`
  width: 120px;
  height: ${({height:e})=>e}px;
  padding: 8px;
  background-color: tomato;
  color: white;
`,i=t.div`
  width: 120px;
  height: ${({$height:e})=>e}px;
  padding: 8px;
  background-color: royalblue;
  color: white;
`,a=t.div`
  width: 120px;
  padding: 8px;
  opacity: ${({opacity:e})=>e};
  background-color: seagreen;
  color: white;
`,o=t.div`
  width: 120px;
  padding: 8px;
  opacity: ${({$opacity:e})=>e};
  background-color: rebeccapurple;
  color: white;
`,s=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,gap:12,padding:16},children:[(0,n.jsx)(r,{height:40,children:`Regular 40`}),(0,n.jsx)(r,{height:80,children:`Regular 80`}),(0,n.jsx)(i,{$height:50,children:`Transient 50`}),(0,n.jsx)(i,{$height:90,children:`Transient 90`}),(0,n.jsx)(a,{opacity:.4,children:`Opacity 0.4`}),(0,n.jsx)(a,{opacity:.8,children:`Opacity 0.8`}),(0,n.jsx)(o,{$opacity:.5,children:`Transient 0.5`}),(0,n.jsx)(o,{$opacity:.9,children:`Transient 0.9`})]});export{s as App,a as Fader,r as Panel,o as TransientFader,i as TransientPanel};