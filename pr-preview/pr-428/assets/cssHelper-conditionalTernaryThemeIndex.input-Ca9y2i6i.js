import"./chunk-jRWAZmH_.js";import{f as e,p as t,s as n,u as r}from"./index-B2vqbvZd.js";t();var i=e(),a=n.div`
  display: flex;
  ${e=>e.outlined?r`
          outline: 1px solid
            ${e.color?e.theme.color[e.color]:e.theme.color.labelMuted};
        `:r`
          background: ${e.color?e.theme.color[e.color]:e.theme.color.labelMuted};
        `}
`,o=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:12,flexDirection:`column`},children:[(0,i.jsx)(a,{outlined:!0,children:`Outlined default`}),(0,i.jsx)(a,{outlined:!0,color:`labelBase`,children:`Outlined custom`}),(0,i.jsx)(a,{outlined:!1,children:`Background default`}),(0,i.jsx)(a,{outlined:!1,color:`labelBase`,children:`Background custom`})]});export{o as App};