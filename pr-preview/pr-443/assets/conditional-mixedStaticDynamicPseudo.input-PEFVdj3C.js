import{c as e,d as t,p as n}from"./index-DBDZ84qt.js";var r=n(),i=24,a=e.div`
  position: relative;
  padding: 20px;
  background-color: #f5f5f5;

  ${e=>e.$enabled?t`
          &:hover {
            left: ${e.$collapsed?0:i}px;
            opacity: 0.8;
          }
        `:``}
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:`12px`,padding:`12px`},children:[(0,r.jsx)(a,{$collapsed:!1,$enabled:!0,children:`Enabled, Not Collapsed`}),(0,r.jsx)(a,{$collapsed:!0,$enabled:!0,children:`Enabled, Collapsed`}),(0,r.jsx)(a,{$collapsed:!1,$enabled:!1,children:`Disabled`})]});export{o as App};