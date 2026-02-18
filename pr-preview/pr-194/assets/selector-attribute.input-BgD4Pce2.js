import{j as e,a as r}from"./index-BzhVV5P-.js";const t=r.input`
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
`,o=r.a`
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
`,n=()=>e.jsxs("div",{children:[e.jsx(t,{type:"text",placeholder:"Enter text..."}),e.jsx(t,{type:"text",disabled:!0,placeholder:"Disabled"}),e.jsx(t,{type:"checkbox"}),e.jsx(t,{type:"radio",name:"option"}),e.jsx(t,{type:"text",readOnly:!0,value:"Read only"}),e.jsx("br",{}),e.jsx(o,{href:"/page",children:"Internal Link"}),e.jsx(o,{href:"https://example.com",target:"_blank",children:"External HTTPS Link"}),e.jsx(o,{href:"/document.pdf",children:"PDF Link"})]});export{n as App};
