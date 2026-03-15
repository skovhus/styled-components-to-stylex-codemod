import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-GfnpIRuu.js";var n=e(),r=t.input`
  padding: 8px 12px;
  border: 2px solid #ccc;
  border-radius: 4px;
  font-size: 14px;

  &:focus {
    border-color: #bf4f74;
    outline: none;
  }

  &[disabled] {
    background: #f5f5f5;
    color: #999;
    cursor: not-allowed;
  }

  &[type="checkbox"] {
    width: 20px;
    height: 20px;
    padding: 0;
  }

  &[type="radio"] {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
  }

  &[readonly] {
    background: #fafafa;
    border-style: dashed;
  }

  &::placeholder {
    color: #999;
    font-style: italic;
  }
`,i=t.a`
  color: #bf4f74;
  text-decoration: none;

  &[target="_blank"]::after {
    content: " ↗";
    font-size: 0.8em;
  }

  &[href^="https"] {
    color: #4caf50;
  }

  &[href$=".pdf"] {
    color: #f44336;
  }
`,a=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{type:`text`,placeholder:`Enter text...`}),(0,n.jsx)(r,{type:`text`,disabled:!0,placeholder:`Disabled`}),(0,n.jsx)(r,{type:`checkbox`}),(0,n.jsx)(r,{type:`radio`,name:`option`}),(0,n.jsx)(r,{type:`text`,readOnly:!0,value:`Read only`}),(0,n.jsx)(`br`,{}),(0,n.jsx)(i,{href:`/page`,children:`Internal Link`}),(0,n.jsx)(i,{href:`https://example.com`,target:`_blank`,children:`External HTTPS Link`}),(0,n.jsx)(i,{href:`/document.pdf`,children:`PDF Link`})]});export{a as App};