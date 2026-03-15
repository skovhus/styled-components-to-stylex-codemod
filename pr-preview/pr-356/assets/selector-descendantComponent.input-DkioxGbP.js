import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-DRa1uduC.js";e(t(),1);var i=n(),a=r.div`
  background: ${e=>e.theme.color.bgSub};
  width: 100px;
  height: 100px;
`,o=r.a`
  &:focus-visible ${a} {
    outline: 10px solid ${e=>e.theme.color.labelBase};
    outline-offset: 5px;
  }
`,s=r.div`
  width: 50px;
  height: 50px;
  background: white;
`,c=r.div`
  &:hover ${s} {
    box-shadow: 0 4px 8px ${e=>e.theme.color.labelBase};
  }
`,l=r.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  background: currentColor;
  mask-size: contain;
  border-radius: 50%;
`,u=r.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #BF4F74;
  color: white;
  border: none;
  border-radius: 4px;

  ${l} {
    width: 20px;
    height: 20px;
    opacity: 0.8;
  }

  &:hover ${l} {
    opacity: 1;
    transform: scale(1.1);
  }
`,d=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsxs)(u,{children:[`Click me`,(0,i.jsx)(l,{})]}),(0,i.jsx)(`br`,{}),(0,i.jsx)(`br`,{}),(0,i.jsx)(o,{href:`#`,children:(0,i.jsx)(a,{})}),(0,i.jsx)(`br`,{}),(0,i.jsx)(`br`,{}),(0,i.jsx)(c,{children:(0,i.jsx)(s,{})})]});export{d as App,o as ContainerLink};