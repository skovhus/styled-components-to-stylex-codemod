import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,l as n,p as r}from"./index-DN9jWtl0.js";r();var i=e(),a=n.path`
  fill: url(#gradient);
  opacity: 0;
  transition: opacity 0.3s;
`,o=n.g`
  filter: url(#blur);
  transform: scale(1);
  transition: transform 0.3s;
`,s=t`
  &:hover ${a} {
    opacity: 1;
  }
  &:hover ${o} {
    transform: scale(1.1);
  }
`,c=n.div`
  ${s}
  padding: 16px;
  background-color: #f0f5ff;
`;function l(){return(0,i.jsx)(c,{children:(0,i.jsxs)(`svg`,{viewBox:`0 0 100 100`,children:[(0,i.jsx)(a,{d:`M10 80 Q 52.5 10, 95 80`}),(0,i.jsx)(o,{children:(0,i.jsx)(`rect`,{x:`10`,y:`10`,width:`80`,height:`80`,fill:`#6a7ab5`})})]})})}export{l as App};