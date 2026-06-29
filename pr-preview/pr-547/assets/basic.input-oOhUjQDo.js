import{s as e,t}from"./jsx-runtime-D4ePz0Hl.js";import{m as n,u as r}from"./index-kDXuxwHk.js";var i=e(n(),1),a=t(),o=r.h1`
  font-size: 1.5em;
  text-align: center;
  color: #bf4f74;
`,s=r.section`
  padding: 4em;
  background: papayawhip;
`,c=r.select`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
`;function l(e){return(0,a.jsx)(`a`,{href:e.to,children:e.children})}var u=r.span`
  position: relative;
`,d=r.span`
  color: rebeccapurple;
`;function f(e){return(0,a.jsx)(`span`,{"data-count":i.Children.count(e.children),children:e.children})}function p(e){return(0,a.jsxs)(a.Fragment,{children:[`Browse `,(0,a.jsx)(l,{to:e.integrationsPath,children:`integrations`}),` to enable new agents, or manage access`,(0,a.jsx)(u,{children:`team`})]})}function m(){return(0,a.jsxs)(f,{children:[`Before `,(0,a.jsx)(d,{}),` after`]})}var h=()=>(0,a.jsxs)(s,{children:[(0,a.jsx)(o,{children:`Hello World!`}),(0,a.jsx)(p,{integrationsPath:`/integrations`}),(0,a.jsx)(m,{}),(0,a.jsx)(c,{onChange:e=>console.log(e.target.value)})]});export{h as App,m as ChildrenShapeRepro,p as Repro,c as Select};