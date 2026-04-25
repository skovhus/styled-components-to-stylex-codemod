import"./chunk-zsgVPwQN.js";import{t as e}from"./react-D4cBbUL-.js";import{f as t,s as n}from"./index-Dpcla9Qm.js";e();var r=t(),i=n.label`
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
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`},children:[(0,r.jsx)(i,{checked:!1,disabled:!1,children:(0,r.jsx)(a,{children:`Unchecked, not disabled`})}),(0,r.jsx)(i,{checked:!0,disabled:!1,children:(0,r.jsx)(a,{children:`Checked, not disabled`})}),(0,r.jsx)(i,{checked:!0,disabled:!0,children:(0,r.jsx)(a,{children:`Checked, disabled`})})]});export{o as App};