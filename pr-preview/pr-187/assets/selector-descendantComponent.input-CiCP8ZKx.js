import{j as o,a as e}from"./index-D5aCdehV.js";const n=e.div`
  background: ${i=>i.theme.color.bgSub};
  width: 100px;
  height: 100px;
`,r=e.a`
  &:focus-visible ${n} {
    outline: 10px solid ${i=>i.theme.color.labelBase};
    outline-offset: 5px;
  }
`,s=e.div`
  width: 50px;
  height: 50px;
  background: white;
`,x=e.div`
  &:hover ${s} {
    box-shadow: 0 4px 8px ${i=>i.theme.color.labelBase};
  }
`,t=e.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  background: currentColor;
  mask-size: contain;
  border-radius: 50%;
`,a=e.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #BF4F74;
  color: white;
  border: none;
  border-radius: 4px;

  ${t} {
    width: 20px;
    height: 20px;
    opacity: 0.8;
  }

  &:hover ${t} {
    opacity: 1;
    transform: scale(1.1);
  }
`,d=()=>o.jsxs("div",{children:[o.jsxs(a,{children:["Click me",o.jsx(t,{})]}),o.jsx("br",{}),o.jsx("br",{}),o.jsx(r,{href:"#",children:o.jsx(n,{})}),o.jsx("br",{}),o.jsx("br",{}),o.jsx(x,{children:o.jsx(s,{})})]});export{d as App,r as ContainerLink};
