import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-D7VsD0Sq.js";var n=e(),r=t.div`
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
  height: ${({height:e})=>e}px;
  padding: 8px;
  background-color: goldenrod;
  color: white;
`,o=t.div`
  width: 120px;
  padding: 8px;
  opacity: ${({opacity:e})=>e};
  background-color: seagreen;
  color: white;
`,s=t.div`
  width: 120px;
  padding: 8px;
  opacity: ${({$opacity:e})=>e};
  background-color: rebeccapurple;
  color: white;
`,c=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,gap:12,padding:16},children:[(0,n.jsx)(r,{height:40,children:`Regular 40`}),(0,n.jsx)(r,{height:80,children:`Regular 80`}),(0,n.jsx)(i,{$height:50,children:`Transient 50`}),(0,n.jsx)(i,{$height:90,children:`Transient 90`}),(0,n.jsx)(a,{height:40,children:`Flexible 40`}),(0,n.jsx)(a,{height:80,children:`Flexible 80`}),(0,n.jsx)(o,{opacity:.4,children:`Opacity 0.4`}),(0,n.jsx)(o,{opacity:.8,children:`Opacity 0.8`}),(0,n.jsx)(s,{$opacity:.5,children:`Transient 0.5`}),(0,n.jsx)(s,{$opacity:.9,children:`Transient 0.9`})]});export{c as App,o as Fader,a as FlexiblePanel,r as Panel,s as TransientFader,i as TransientPanel};