import{j as d,d as s}from"./index-B4qiiF0X.js";const l=s.label`
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
`,o=()=>d.jsxs("div",{style:{display:"flex",flexDirection:"column"},children:[d.jsx(l,{checked:!1,disabled:!1,children:d.jsx(i,{children:"Unchecked, not disabled"})}),d.jsx(l,{checked:!0,disabled:!1,children:d.jsx(i,{children:"Checked, not disabled"})}),d.jsx(l,{checked:!0,disabled:!0,children:d.jsx(i,{children:"Checked, disabled"})})]});export{o as App};
