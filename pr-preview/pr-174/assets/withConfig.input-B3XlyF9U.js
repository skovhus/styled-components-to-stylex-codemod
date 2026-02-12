import{j as r,a as n}from"./index-8HERoedA.js";const t=n.button.withConfig({displayName:"PrimaryButton"})`
  background: #bf4f74;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
`,e=n.div.withConfig({displayName:"Card",componentId:"sc-card-123"})`
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`,d=n.input.withConfig({displayName:"StyledInput",componentId:"sc-input-456",shouldForwardProp:o=>o!=="hasError"})`
  padding: 8px 12px;
  border: 2px solid ${o=>o.hasError?"red":"#ccc"};
  border-radius: 4px;
  font-size: 14px;

  &:focus {
    border-color: ${o=>o.hasError?"red":"#BF4F74"};
    outline: none;
  }
`,i=n.button`
  font-size: 14px;
  cursor: pointer;
`,p=n(i).withConfig({displayName:"ExtendedButton"})`
  background: #4f74bf;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
`,s=()=>r.jsxs("div",{children:[r.jsx(t,{children:"Primary Button"}),r.jsx(e,{children:r.jsx("p",{children:"Card content"})}),r.jsx(d,{placeholder:"Normal input"}),r.jsx(d,{hasError:!0,placeholder:"Error input"}),r.jsx(p,{children:"Extended Button"})]});export{s as App};
