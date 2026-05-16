import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,d as n,p as r}from"./index-BAkjUjL2.js";r();var i=e(),a=t.div`
  display: flex;
  ${e=>e.outlined?n`
          outline: 1px solid
            ${e.color?e.theme.color[e.color]:e.theme.color.labelMuted};
        `:n`
          background: ${e.color?e.theme.color[e.color]:e.theme.color.labelMuted};
        `}
`,o=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:12,flexDirection:`column`},children:[(0,i.jsx)(a,{outlined:!0,children:`Outlined default`}),(0,i.jsx)(a,{outlined:!0,color:`labelBase`,children:`Outlined custom`}),(0,i.jsx)(a,{outlined:!1,children:`Background default`}),(0,i.jsx)(a,{outlined:!1,color:`labelBase`,children:`Background custom`})]});export{o as App};