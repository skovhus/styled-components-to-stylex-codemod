import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-BjfJDrQX.js";t();var r=e(),i=n.div`
  display: flex;
  flex-grow: 1;
  align-items: stretch;
  height: 100%;
  overflow: hidden;
  position: relative;
`,a=e=>{let{as:t=`div`,...n}=e;return(0,r.jsx)(t,{...n})},o=n(a)`
  padding: 16px;
  background: ${e=>e.variant===`primary`?`blue`:`gray`};
`,s=n(a).attrs({as:`a`})`
  padding: 12px;
  background: ${e=>e.variant===`primary`?`navy`:`slategray`};
`,c=()=>(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(i,{onClick:()=>{}}),(0,r.jsx)(o,{variant:`primary`,children:`Content`}),(0,r.jsx)(s,{variant:`secondary`,children:`Static as content`})]});export{c as App,i as ContentViewContainer,s as StaticAsWrapper,o as StyledWrapper};