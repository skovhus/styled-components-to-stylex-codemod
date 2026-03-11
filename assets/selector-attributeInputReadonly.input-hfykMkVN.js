import{j as e,c as r}from"./index-IySTKqFW.js";const o=r.input`
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  background-color: white;

  &:focus {
    border-color: #bf4f74;
    outline: none;
  }

  &[readonly] {
    background-color: #f5f5f5;
    border-style: dashed;
    cursor: default;
  }
`;function d(){return e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8,padding:16},children:[e.jsx(o,{type:"text",placeholder:"Editable"}),e.jsx(o,{type:"text",readOnly:!0,value:"Read only field"})]})}export{d as App,o as TextInput};
