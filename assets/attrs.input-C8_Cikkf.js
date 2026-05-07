import"./chunk-jRWAZmH_.js";import{c as e,m as t,p as n}from"./index-CEFhOoTi.js";import{l as r}from"./helpers-RNqablwo.js";t();var i=n(),a=e=>{let{column:t,center:n,focusIndex:r,...a}=e;return(0,i.jsx)(`div`,{"data-focus-index":r,...a})},o=e.input.attrs(e=>({type:`text`,size:e.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${e=>e.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,s=e(`input`).attrs(e=>({"data-1p-ignore":e.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,c=e(a).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${e=>+!e.loaded};
`,l=e(a).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,u=e(a).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,d=e(a).attrs(e=>({tabIndex:e.focusIndex??0}))`
  overflow-y: auto;
`,f=e.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow: auto;
`,p=e(a).attrs(e=>({column:e.column??!0}))`
  align-items: center;
`,m=e.span.attrs({style:{whiteSpace:`nowrap`}})`
  color: blue;
`,h=e.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:void 0}}))`
  display: flex;
  align-items: center;
`,g=e.div.attrs(e=>({style:{height:e.height}}))`
  position: absolute;
  min-height: 1px;
  background-color: #eef2ff;

  &:focus-visible {
    ${r};
    outline-offset: 3px;
  }
`,_=e.div.attrs(e=>({style:{height:e.$height??1}}))`
  width: 100%;
  background-color: #94a3b8;
`,v=e.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:`16px`}}))`
  width: 100%;
  background-color: #16a34a;
`;function y(e){let{className:t,height:n,style:r}=e;return(0,i.jsx)(_,{$height:n,className:t,style:r})}function b(e){let{children:t,className:n,size:r,style:a,variant:o}=e;return(0,i.jsx)(`button`,{className:n,"data-size":r,"data-variant":o,style:a,children:t})}var x=e(e(b).attrs({size:`small`,variant:`borderless`})`
  padding: 4px 8px;
`)`
  color: #4338ca;
  background-color: #e0e7ff;
`,S=e.span.attrs({style:{color:`#0f766e`}})`
  font-weight: 600;
`,C=`#7c3aed`,w=e.span.attrs(()=>({style:{color:C}}))`
  font-style: italic;
`,T=()=>(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(o,{$small:!0,placeholder:`Small`}),(0,i.jsx)(o,{placeholder:`Normal`}),(0,i.jsx)(o,{$padding:`2em`,placeholder:`Padded`}),(0,i.jsx)(s,{placeholder:`Text input`}),(0,i.jsx)(c,{loaded:!1,children:`Content`}),(0,i.jsx)(l,{children:`Scrollable content`}),(0,i.jsx)(u,{gutter:`stable`,children:`Type alias scrollable`}),(0,i.jsx)(d,{focusIndex:5,children:`Focus content`}),(0,i.jsx)(f,{children:`Box content`}),(0,i.jsx)(p,{children:`Aligned content`}),(0,i.jsx)(m,{children:`No wrapping text`}),(0,i.jsx)(h,{$height:50,children:`Dynamic height`}),(0,i.jsx)(g,{height:64,children:`Tile with attrs height`}),(0,i.jsx)(y,{height:2,style:{opacity:1}}),(0,i.jsx)(v,{$height:4,children:`Fallback separator`}),(0,i.jsx)(x,{children:`Inherited attrs`}),(0,i.jsx)(S,{children:`Module scope style`}),(0,i.jsx)(w,{children:`Callback scope style`})]});export{p as AlignedFlex,T as App,c as Background,d as FocusableScroll,l as Scrollable,u as ScrollableWithType,s as TextInput};