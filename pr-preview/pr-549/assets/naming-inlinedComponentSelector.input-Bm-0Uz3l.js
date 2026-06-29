import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,m as n,u as r}from"./index-akHkb_FT.js";n();var i=e(),a=r.path`
  fill: url(#gradient);
  opacity: 0;
  transition: opacity 0.3s;
`,o=r.g`
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
`,c=r.div`
  ${s}
  padding: 16px;
  background-color: #f0f5ff;
`;function l(){return(0,i.jsx)(c,{children:(0,i.jsxs)(`svg`,{viewBox:`0 0 100 100`,children:[(0,i.jsx)(a,{d:`M10 80 Q 52.5 10, 95 80`}),(0,i.jsx)(o,{children:(0,i.jsx)(`rect`,{x:`10`,y:`10`,width:`80`,height:`80`,fill:`#6a7ab5`})})]})})}export{l as App};