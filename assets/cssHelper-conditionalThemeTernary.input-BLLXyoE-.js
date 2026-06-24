import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,m as n,u as r}from"./index-BH9Zm44t.js";n();var i=e(),a=r.div`
  display: flex;
  ${e=>e.$isDisabled&&t`
      color: ${e.theme.isDark?`#ffffff55`:`#FFFFFF`};
    `}
  ${e=>e.$isInactive?t`
          background-color: ${e.theme.color.bgBorderSolid};
        `:``};
  ${e=>e.$isInvite?t`
          background-color: ${e.theme.color.bgBase};
        `:``};
`,o=r.div`
  padding: 8px;
  ${e=>e.highlighted&&t`
      border-width: ${e.theme.isDark?2:1}px;
      border-style: solid;
      border-color: ${e.theme.color.bgBorderSolid};
    `}
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(a,{$fontSize:14,$isDisabled:!0,children:`Disabled`}),(0,i.jsx)(a,{$fontSize:14,$isInactive:!0,children:`Inactive`}),(0,i.jsx)(a,{$fontSize:14,$isInvite:!0,children:`Invite`}),(0,i.jsx)(a,{$fontSize:14,children:`Default`}),(0,i.jsx)(o,{highlighted:!0,children:`Highlighted`}),(0,i.jsx)(o,{children:`Normal`})]});export{s as App};