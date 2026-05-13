import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-DM0kxLmo.js";import{l as r}from"./helpers-duy0f_eh.js";import{t as i}from"./icon-DlNEFZdO.js";n();var a=e(),o=e=>{let{column:t,center:n,focusIndex:r,...i}=e;return(0,a.jsx)(`div`,{"data-focus-index":r,...i})},s=e=>{let{focusIndex:t,otherAttribute:n,someAttribute:r,...i}=e;return(0,a.jsx)(`section`,{"data-focus-index":t,"data-other-attribute":n?`true`:`false`,"data-some-attribute":r?`true`:`false`,...i})},c=t.input.attrs(e=>({type:`text`,size:e.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${e=>e.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,l=t(`input`).attrs(e=>({"data-1p-ignore":e.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,u=t(o).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${e=>+!e.loaded};
`,d=t(s).attrs({someAttribute:!0})`
  padding: 16px 16px;
  background-color: #f0f9ff;
`,f=t(s).attrs({someAttribute:!0})`
  padding: 12px;
  background-color: #ecfdf5;
`,p=t(s).attrs({someAttribute:!0})`
  color: ${e=>e.$active?`#1d4ed8`:`#64748b`};
`,m=t(s).attrs({someAttribute:!0})`
  padding: 10px;
  background-color: ${e=>e.tone===`success`?`#dcfce7`:`#dbeafe`};
`,h=t(s).attrs({someAttribute:!0})`
  padding: 14px;
  background-color: #fef3c7;
`,g=t(s)`
  color: ${e=>e.tone===`secondary`?`#7c2d12`:`#1e3a8a`};
`,_=t(s).attrs({someAttribute:!0})`
  padding: 6px;
  background-color: #fdf2f8;
`,v=t(s).attrs(e=>({tabIndex:e.focusIndex}))`
  color: #334155;
`,y=t(s).attrs({someAttribute:!0})`
  padding: 18px;
  background-color: #eef2ff;
`,b=t(s).attrs({otherAttribute:!0,someAttribute:!0})`
  padding: 20px;
  background-color: #f0fdf4;
`,x=t(s).attrs({someAttribute:!0})`
  padding: 22px;
  background-color: #fff7ed;
`,S=t(s).attrs({someAttribute:!0})`
  padding: 24px;
  background-color: #f8fafc;
`,C=t(o).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,w=t(o).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,T=t(o).attrs(e=>({tabIndex:e.focusIndex??0}))`
  overflow-y: auto;
`,E=t.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow: auto;
`,D=t(o).attrs(e=>({column:e.column??!0}))`
  align-items: center;
`,O=t.span.attrs({style:{whiteSpace:`nowrap`}})`
  color: blue;
`,k=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:void 0}}))`
  display: flex;
  align-items: center;
`,A=t.div.attrs(e=>({style:{height:e.height}}))`
  position: absolute;
  min-height: 1px;
  background-color: #eef2ff;

  &:focus-visible {
    ${r};
    outline-offset: 3px;
  }
`,j=t.div.attrs(e=>({style:{height:e.height}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fee2e2;
`,M=t.div.attrs(e=>({style:{height:e.height??`16px`}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fef3c7;
`,N=t.div.attrs(e=>({style:{height:e.$height??1}}))`
  width: 100%;
  background-color: #94a3b8;
`,P=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:`16px`}}))`
  width: 100%;
  background-color: #16a34a;
`;function F(e){let{className:t,height:n,style:r}=e;return(0,a.jsx)(N,{$height:n,className:t,style:r})}function I(e){let{children:t,className:n,size:r,style:i,variant:o}=e;return(0,a.jsx)(`button`,{className:n,"data-size":r,"data-variant":o,style:i,children:t})}var L=t(t(I).attrs({size:`small`,variant:`borderless`})`
  padding: 4px 8px;
`)`
  color: #4338ca;
  background-color: #e0e7ff;
`,R=t.span.attrs({style:{color:`#0f766e`}})`
  font-weight: 600;
`,z=`#7c3aed`,B=t.span.attrs(()=>({style:{color:z}}))`
  font-style: italic;
`,V=t(i).attrs({size:14})`
  position: relative;
  left: -3px;
`,H=()=>(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(c,{$small:!0,placeholder:`Small`}),(0,a.jsx)(c,{placeholder:`Normal`}),(0,a.jsx)(c,{$padding:`2em`,placeholder:`Padded`}),(0,a.jsx)(l,{placeholder:`Text input`}),(0,a.jsx)(u,{loaded:!1,children:`Content`}),(0,a.jsx)(d,{label:`section-label`,children:`Section content`}),(0,a.jsx)(f,{label:`imported-section-label`,children:`Imported section content`}),(0,a.jsx)(p,{$active:!0,children:`Highlighted section content`}),(0,a.jsx)(m,{tone:`success`,children:`Utility section content`}),(0,a.jsx)(h,{tone:`primary`,children:`Shared attrs section content`}),(0,a.jsx)(g,{someAttribute:!1,tone:`secondary`,children:`Shared plain section content`}),(0,a.jsx)(_,{localLabel:`local-label`,children:`Imported intersection section content`}),(0,a.jsx)(v,{focusIndex:2,children:`Focus index section content`}),(0,a.jsx)(y,{label:`pick-label`,children:`Pick section content`}),(0,a.jsx)(b,{label:`multi-label`,children:`Multi imported section content`}),(0,a.jsx)(x,{localLabel:`inherited-label`,children:`Inherited section content`}),(0,a.jsx)(S,{kind:`alpha`,children:`Union section content`}),(0,a.jsx)(C,{children:`Scrollable content`}),(0,a.jsx)(w,{gutter:`stable`,children:`Type alias scrollable`}),(0,a.jsx)(T,{focusIndex:5,children:`Focus content`}),(0,a.jsx)(E,{children:`Box content`}),(0,a.jsx)(D,{children:`Aligned content`}),(0,a.jsx)(O,{children:`No wrapping text`}),(0,a.jsx)(k,{$height:50,children:`Dynamic height`}),(0,a.jsx)(A,{height:64,children:`Tile with attrs height`}),(0,a.jsx)(j,{children:`Optional height omitted`}),(0,a.jsx)(j,{height:24,children:`Optional height set`}),(0,a.jsx)(M,{children:`Mixed fallback height`}),(0,a.jsx)(F,{height:2,style:{opacity:1}}),(0,a.jsx)(P,{$height:4,children:`Fallback separator`}),(0,a.jsx)(L,{children:`Inherited attrs`}),(0,a.jsx)(R,{children:`Module scope style`}),(0,a.jsx)(B,{children:`Callback scope style`}),(0,a.jsx)(V,{title:`Attrs icon size`})]});export{D as AlignedFlex,H as App,u as Background,v as FocusIndexSection,T as FocusableScroll,p as HighlightSection,_ as ImportedIntersectionSection,f as ImportedSection,x as InheritedSection,b as MultiImportedSection,y as PickSection,C as Scrollable,w as ScrollableWithType,d as Section,h as SharedAttrsSection,g as SharedPlainSection,l as TextInput,S as UnionSection,m as UtilitySection};