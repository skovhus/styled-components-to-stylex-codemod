import{c as o,j as e}from"./index-zpS6Pxyx.js";const n=t=>{const{column:g,center:m,focusIndex:a,...r}=t;return e.jsx("div",{"data-focus-index":a,...r})},l=o.input.attrs(t=>({type:"text",size:t.$small?5:void 0}))`
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
`,c=o(n).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${t=>t.loaded?0:1};
`,i=o(n).attrs(t=>({tabIndex:t.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,d=o(n).attrs(t=>({tabIndex:t.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,x=o(n).attrs(t=>({tabIndex:t.focusIndex??0}))`
  overflow-y: auto;
`,p=o.div.attrs(t=>({tabIndex:t.tabIndex??0}))`
  overflow: auto;
`,u=o(n).attrs(t=>({column:t.column??!0}))`
  align-items: center;
`,h=o.span.attrs({style:{whiteSpace:"nowrap"}})`
  color: blue;
`,b=o.div.attrs(({$height:t})=>({style:{height:t?`${t}px`:void 0}}))`
  display: flex;
  align-items: center;
`,j=()=>e.jsxs(e.Fragment,{children:[e.jsx(l,{$small:!0,placeholder:"Small"}),e.jsx(l,{placeholder:"Normal"}),e.jsx(l,{$padding:"2em",placeholder:"Padded"}),e.jsx(s,{placeholder:"Text input"}),e.jsx(c,{loaded:!1,children:"Content"}),e.jsx(i,{children:"Scrollable content"}),e.jsx(d,{gutter:"stable",children:"Type alias scrollable"}),e.jsx(x,{focusIndex:5,children:"Focus content"}),e.jsx(p,{children:"Box content"}),e.jsx(u,{children:"Aligned content"}),e.jsx(h,{children:"No wrapping text"}),e.jsx(b,{$height:50,children:"Dynamic height"})]});export{u as AlignedFlex,j as App,c as Background,x as FocusableScroll,i as Scrollable,d as ScrollableWithType,s as TextInput};
