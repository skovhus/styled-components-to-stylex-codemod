import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-DRa1uduC.js";e(t(),1);var i=n(),a=r.label`
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
`,o=r.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`},children:[(0,i.jsx)(a,{checked:!1,disabled:!1,children:(0,i.jsx)(o,{children:`Unchecked, not disabled`})}),(0,i.jsx)(a,{checked:!0,disabled:!1,children:(0,i.jsx)(o,{children:`Checked, not disabled`})}),(0,i.jsx)(a,{checked:!0,disabled:!0,children:(0,i.jsx)(o,{children:`Checked, disabled`})})]});export{s as App};