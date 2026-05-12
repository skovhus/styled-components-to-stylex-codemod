import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-D7SGfj3i.js";import{l as r}from"./helpers-CTVMGiCI.js";import{t as i}from"./icon-D058FloM.js";import{t as a}from"./sx-aware-component-Y2n5YzEL.js";n();var o=e(),s={},c=e=>{let{column:t,center:n,focusIndex:r,...i}=e;return(0,o.jsx)(`div`,{"data-focus-index":r,...i})},l=t.input.attrs(e=>({type:`text`,size:e.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${e=>e.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,u=t(`input`).attrs(e=>({"data-1p-ignore":e.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,d=t(c).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${e=>+!e.loaded};
`,f=t(c).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,p=t(c).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,m=t(c).attrs(e=>({tabIndex:e.focusIndex??0}))`
  overflow-y: auto;
`,h=t.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow: auto;
`,g=t(c).attrs(e=>({column:e.column??!0}))`
  align-items: center;
`,_=t.span.attrs({style:{whiteSpace:`nowrap`}})`
  color: blue;
`,v=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:void 0}}))`
  display: flex;
  align-items: center;
`,y=t.div.attrs(e=>({style:{height:e.height}}))`
  position: absolute;
  min-height: 1px;
  background-color: #eef2ff;

  &:focus-visible {
    ${r};
    outline-offset: 3px;
  }
`,b=t.div.attrs(e=>({style:{height:e.height}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fee2e2;
`,x=t.div.attrs(e=>({style:{height:e.height??`16px`}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fef3c7;
`,S=t.div.attrs(e=>({style:{height:e.$height??1}}))`
  width: 100%;
  background-color: #94a3b8;
`,C=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:`16px`}}))`
  width: 100%;
  background-color: #16a34a;
`;function w(e){let{className:t,height:n,style:r}=e;return(0,o.jsx)(S,{$height:n,className:t,style:r})}function T(e){let{children:t,className:n,size:r,style:i,variant:a}=e;return(0,o.jsx)(`button`,{className:n,"data-size":r,"data-variant":a,style:i,children:t})}var E=t(t(T).attrs({size:`small`,variant:`borderless`})`
  padding: 4px 8px;
`)`
  color: #4338ca;
  background-color: #e0e7ff;
`,D=t.span.attrs({style:{color:`#0f766e`}})`
  font-weight: 600;
`,O=`#7c3aed`,k=t.span.attrs(()=>({style:{color:O}}))`
  font-style: italic;
`,A=t(i).attrs({size:14})`
  position: relative;
  left: -3px;
`,j=t(a).attrs({sx:s,type:`button`})`
  color: #2563eb;
`,M=()=>(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)(l,{$small:!0,placeholder:`Small`}),(0,o.jsx)(l,{placeholder:`Normal`}),(0,o.jsx)(l,{$padding:`2em`,placeholder:`Padded`}),(0,o.jsx)(u,{placeholder:`Text input`}),(0,o.jsx)(d,{loaded:!1,children:`Content`}),(0,o.jsx)(f,{children:`Scrollable content`}),(0,o.jsx)(p,{gutter:`stable`,children:`Type alias scrollable`}),(0,o.jsx)(m,{focusIndex:5,children:`Focus content`}),(0,o.jsx)(h,{children:`Box content`}),(0,o.jsx)(g,{children:`Aligned content`}),(0,o.jsx)(_,{children:`No wrapping text`}),(0,o.jsx)(v,{$height:50,children:`Dynamic height`}),(0,o.jsx)(y,{height:64,children:`Tile with attrs height`}),(0,o.jsx)(b,{children:`Optional height omitted`}),(0,o.jsx)(b,{height:24,children:`Optional height set`}),(0,o.jsx)(x,{children:`Mixed fallback height`}),(0,o.jsx)(w,{height:2,style:{opacity:1}}),(0,o.jsx)(C,{$height:4,children:`Fallback separator`}),(0,o.jsx)(E,{children:`Inherited attrs`}),(0,o.jsx)(D,{children:`Module scope style`}),(0,o.jsx)(k,{children:`Callback scope style`}),(0,o.jsx)(A,{title:`Attrs icon size`}),(0,o.jsx)(j,{children:`Attrs sx`})]});export{g as AlignedFlex,M as App,d as Background,m as FocusableScroll,f as Scrollable,p as ScrollableWithType,u as TextInput};