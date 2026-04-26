import"./chunk-jRWAZmH_.js";import{c as e,f as t,p as n,u as r}from"./index-BPaLyyRP.js";n();var i=t(),a=r.div`
  display: flex;
  ${t=>t.outlined?e`
          outline: 1px solid
            ${t.color?t.theme.color[t.color]:t.theme.color.labelMuted};
        `:e`
          background: ${t.color?t.theme.color[t.color]:t.theme.color.labelMuted};
        `}
`,o=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:12,flexDirection:`column`},children:[(0,i.jsx)(a,{outlined:!0,children:`Outlined default`}),(0,i.jsx)(a,{outlined:!0,color:`labelBase`,children:`Outlined custom`}),(0,i.jsx)(a,{outlined:!1,children:`Background default`}),(0,i.jsx)(a,{outlined:!1,color:`labelBase`,children:`Background custom`})]});export{o as App};