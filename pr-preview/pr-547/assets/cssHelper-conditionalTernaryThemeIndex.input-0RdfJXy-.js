import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,m as n,u as r}from"./index-TCtepa20.js";n();var i=e(),a=r.div`
  display: flex;
  ${e=>e.outlined?t`
          outline: 1px solid
            ${e.color?e.theme.color[e.color]:e.theme.color.labelMuted};
        `:t`
          background: ${e.color?e.theme.color[e.color]:e.theme.color.labelMuted};
        `}
`,o=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:12,flexDirection:`column`},children:[(0,i.jsx)(a,{outlined:!0,children:`Outlined default`}),(0,i.jsx)(a,{outlined:!0,color:`labelBase`,children:`Outlined custom`}),(0,i.jsx)(a,{outlined:!1,children:`Background default`}),(0,i.jsx)(a,{outlined:!1,color:`labelBase`,children:`Background custom`})]});export{o as App};