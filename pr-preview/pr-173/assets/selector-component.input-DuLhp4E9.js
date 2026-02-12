import{j as e,a as o}from"./index-CpVFPXAI.js";const i=o.a`
  display: flex;
  align-items: center;
  padding: 5px 10px;
  background: papayawhip;
  color: #bf4f74;
`,s=o.svg`
  flex: none;
  width: 48px;
  height: 48px;
  fill: #bf4f74;
  transition: fill 0.25s;

  ${i}:hover & {
    fill: rebeccapurple;
  }
`,a=o.span`
  padding: 4px 8px;
  background: ${l=>l.theme.color.bgSub};

  ${i}:focus-visible & {
    outline: 2px solid ${l=>l.theme.color.labelBase};
  }
`,p=()=>e.jsxs(i,{href:"#",children:[e.jsx(s,{viewBox:"0 0 20 20",children:e.jsx("path",{d:"M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"})}),e.jsx(a,{children:"Label"}),"Hover me"]});export{p as App};
