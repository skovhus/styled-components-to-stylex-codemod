import{j as e,a as o}from"./index-DHZz3PB-.js";const a=t=>{const{column:u,center:b,focusIndex:n,...r}=t;return e.jsx("div",{"data-focus-index":n,...r})},l=o.input.attrs(t=>({type:"text",size:t.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${t=>t.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,s=o("input").attrs(t=>({"data-1p-ignore":t.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,d=o(a).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${t=>t.loaded?0:1};
`,c=o(a).attrs(t=>({tabIndex:t.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,i=o(a).attrs(t=>({tabIndex:t.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,x=o(a).attrs(t=>({tabIndex:t.focusIndex??0}))`
  overflow-y: auto;
`,p=o.div.attrs(t=>({tabIndex:t.tabIndex??0}))`
  overflow: auto;
`,h=()=>e.jsxs(e.Fragment,{children:[e.jsx(l,{$small:!0,placeholder:"Small"}),e.jsx(l,{placeholder:"Normal"}),e.jsx(l,{$padding:"2em",placeholder:"Padded"}),e.jsx(s,{placeholder:"Text input"}),e.jsx(d,{loaded:!1,children:"Content"}),e.jsx(c,{children:"Scrollable content"}),e.jsx(i,{gutter:"stable",children:"Type alias scrollable"}),e.jsx(x,{focusIndex:5,children:"Focus content"}),e.jsx(p,{children:"Box content"})]});export{h as App,d as Background,x as FocusableScroll,c as Scrollable,i as ScrollableWithType,s as TextInput};
