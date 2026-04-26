import"./chunk-jRWAZmH_.js";import{c as e,f as t,p as n,u as r}from"./index-DimFOxuE.js";n();var i=t(),a=r.div`
  display: flex;
  ${t=>t.$isDisabled&&e`
      color: ${t.theme.isDark?`#ffffff55`:`#FFFFFF`};
    `}
  ${t=>t.$isInactive?e`
          background-color: ${t.theme.color.bgBorderSolid};
        `:``};
  ${t=>t.$isInvite?e`
          background-color: ${t.theme.color.bgBase};
        `:``};
`,o=r.div`
  padding: 8px;
  ${t=>t.highlighted&&e`
      border-width: ${t.theme.isDark?2:1}px;
      border-style: solid;
      border-color: ${t.theme.color.bgBorderSolid};
    `}
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(a,{$fontSize:14,$isDisabled:!0,children:`Disabled`}),(0,i.jsx)(a,{$fontSize:14,$isInactive:!0,children:`Inactive`}),(0,i.jsx)(a,{$fontSize:14,$isInvite:!0,children:`Invite`}),(0,i.jsx)(a,{$fontSize:14,children:`Default`}),(0,i.jsx)(o,{highlighted:!0,children:`Highlighted`}),(0,i.jsx)(o,{children:`Normal`})]});export{s as App};