import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-BbiUvuS5.js";t();var r=e(),i=n.label`
  display: flex;
  align-items: flex-start;
  margin: 8px;
  border-radius: 6px;
  opacity: ${e=>e.disabled?.5:1};
  position: relative;
  border: 1px solid ${e=>e.theme.color.bgSub};

  &:hover {
    border-color: ${e=>e.disabled?e.theme.color.bgBase:e.checked?e.theme.color.bgSub:e.theme.color.bgBase};
  }

  &:focus-within:has(:focus-visible) {
    outline-style: solid;
  }
`,a=n.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
`,o=n.div`
  padding: 8px;
  background-color: lavender;
  opacity: ${e=>e.active?e.size===`large`?1:.5:.1};
`,s=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`},children:[(0,r.jsx)(i,{checked:!1,disabled:!1,children:(0,r.jsx)(a,{children:`Unchecked, not disabled`})}),(0,r.jsx)(i,{checked:!0,disabled:!1,children:(0,r.jsx)(a,{children:`Checked, not disabled`})}),(0,r.jsx)(i,{checked:!0,disabled:!0,children:(0,r.jsx)(a,{children:`Checked, disabled`})}),(0,r.jsx)(o,{active:!0,size:`large`,children:`Active large (opacity 1)`}),(0,r.jsx)(o,{active:!0,children:`Active small (opacity 0.5)`}),(0,r.jsx)(o,{children:`Inactive (opacity 0.1)`})]});export{s as App};