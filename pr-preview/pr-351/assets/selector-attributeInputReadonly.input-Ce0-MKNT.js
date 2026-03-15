import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-CvfJmPeC.js";var n=e(),r=t.input`
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
`;function i(){return(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,n.jsx)(r,{type:`text`,placeholder:`Editable`}),(0,n.jsx)(r,{type:`text`,readOnly:!0,value:`Read only field`})]})}export{i as App,r as TextInput};