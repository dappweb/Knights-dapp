import { SpacetimeVsTraditionalComparison } from './spacetime-comparison-dashboard';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>SpacetimeDB vs 浼犵粺鏁版嵁搴撳姣斿垎鏋?/h1>
        <p>涓撲负鍖哄潡閾綝App浼樺寲鐨勬暟鎹簱閫夋嫨鎸囧崡</p>
      </header>

      <main className="app-main">
        <SpacetimeVsTraditionalComparison />
      </main>

      <footer className="app-footer">
        <p>鍩轰簬鎮ㄧ殑181BSeer椤圭洰鐗圭偣鍒嗘瀽 - 瀹炴椂鍖哄潡閾炬暟鎹悓姝ョ殑鐞嗘兂瑙ｅ喅鏂规</p>
      </footer>
    </div>
  );
}

export default App;