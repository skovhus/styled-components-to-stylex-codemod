import{j as l,a as s}from"./index-_nETKjIl.js";const d=s.label`
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
`,i=s.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
`,o=()=>l.jsxs("div",{style:{display:"flex",flexDirection:"column"},children:[l.jsx(d,{checked:!1,disabled:!1,children:l.jsx(i,{children:"Unchecked, not disabled"})}),l.jsx(d,{checked:!0,disabled:!1,children:l.jsx(i,{children:"Checked, not disabled"})}),l.jsx(d,{checked:!0,disabled:!0,children:l.jsx(i,{children:"Checked, disabled"})})]});export{o as App};
