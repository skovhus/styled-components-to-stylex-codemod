import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-DYcf0Pbm.js";n();var r=e(),i=t.h1`
  font-size: 1.5em;
  text-align: center;
  color: #bf4f74;
`,a=t.section`
  padding: 4em;
  background: papayawhip;
`,o=t.select`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
`;function s(e){return(0,r.jsx)(`a`,{href:e.to,children:e.children})}var c=t.span`
  position: relative;
`;function l(e){return(0,r.jsxs)(r.Fragment,{children:[`Browse `,(0,r.jsx)(s,{to:e.integrationsPath,children:`integrations`}),` to enable new agents, or manage access`,(0,r.jsx)(c,{children:`team`})]})}var u=()=>(0,r.jsxs)(a,{children:[(0,r.jsx)(i,{children:`Hello World!`}),(0,r.jsx)(l,{integrationsPath:`/integrations`}),(0,r.jsx)(o,{onChange:e=>console.log(e.target.value)})]});export{u as App,l as Repro,o as Select};