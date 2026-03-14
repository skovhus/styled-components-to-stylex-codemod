import{j as t,c as r,s as o}from"./index-BAGvateO.js";const i=r.path`
  fill: url(#gradient);
  opacity: 0;
  transition: opacity 0.3s;
`,n=r.g`
  filter: url(#blur);
  transform: scale(1);
  transition: transform 0.3s;
`,s=o`
  &:hover ${i} {
    opacity: 1;
  }
  &:hover ${n} {
    transform: scale(1.1);
  }
`,a=r.div`
  ${s}
  padding: 16px;
  background-color: #f0f5ff;
`;function c(){return t.jsx(a,{children:t.jsxs("svg",{viewBox:"0 0 100 100",children:[t.jsx(i,{d:"M10 80 Q 52.5 10, 95 80"}),t.jsx(n,{children:t.jsx("rect",{x:"10",y:"10",width:"80",height:"80",fill:"#6a7ab5"})})]})})}export{c as App};
