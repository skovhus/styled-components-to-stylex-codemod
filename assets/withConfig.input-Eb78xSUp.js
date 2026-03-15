import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-Dda2rlA_.js";var n=e(),r=t.button.withConfig({displayName:`PrimaryButton`})`
  background: #bf4f74;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
`,i=t.div.withConfig({displayName:`Card`,componentId:`sc-card-123`})`
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`,a=t.input.withConfig({displayName:`StyledInput`,componentId:`sc-input-456`,shouldForwardProp:e=>e!==`hasError`})`
  padding: 8px 12px;
  border: 2px solid ${e=>e.hasError?`red`:`#ccc`};
  border-radius: 4px;
  font-size: 14px;

  &:focus {
    border-color: ${e=>e.hasError?`red`:`#BF4F74`};
    outline: none;
  }
`,o=t(t.button`
  font-size: 14px;
  cursor: pointer;
`).withConfig({displayName:`ExtendedButton`})`
  background: #4f74bf;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
`,s=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{children:`Primary Button`}),(0,n.jsx)(i,{children:(0,n.jsx)(`p`,{children:`Card content`})}),(0,n.jsx)(a,{placeholder:`Normal input`}),(0,n.jsx)(a,{hasError:!0,placeholder:`Error input`}),(0,n.jsx)(o,{children:`Extended Button`})]});export{s as App};