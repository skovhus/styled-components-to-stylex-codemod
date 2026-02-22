import{j as e,a as t}from"./index-CtDxFjjp.js";const r=t.div`
  padding: ${i=>i.$size==="large"?"16px":"8px"};
  background: ${i=>i.$isActive?"blue":"gray"};
  color: white;
`,s=t.img`
  opacity: ${i=>i.$isInactive?.5:1};
  border-radius: 50%;
`,a=t.div`
  position: absolute;
  left: -3px;
  width: 12px;
  height: 4px;
`,c=t.div`
  position: relative;
  height: ${i=>i.$height}px;
`;function n(){return e.jsxs("div",{children:[e.jsx(r,{$isActive:!0,$size:"large",children:"Active large box"}),e.jsx(r,{$size:"small",children:"Small inactive box"}),e.jsx(s,{$isInactive:!0,src:"/avatar.png",alt:"Avatar"}),e.jsx(a,{$pickerHeight:200}),e.jsx(c,{$height:200,children:"Slider content"})]})}export{n as App,r as Box,s as Image};
