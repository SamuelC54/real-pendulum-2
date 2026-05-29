import json
from pathlib import Path

NOTEBOOKS_DIR = Path(__file__).resolve().parent.parent


def clear_notebook_outputs(path: Path) -> bool:
    with path.open("r", encoding="utf-8") as f:
        notebook = json.load(f)

    changed = False
    for cell in notebook.get("cells", []):
        if cell.get("outputs"):
            cell["outputs"] = []
            changed = True
        if cell.get("execution_count") is not None:
            cell["execution_count"] = None
            changed = True

    if changed:
        with path.open("w", encoding="utf-8", newline="\n") as f:
            json.dump(notebook, f, indent=1, ensure_ascii=False)
            f.write("\n")
    return changed


def iter_notebooks(root: Path):
    for path in root.rglob("*.ipynb"):
        if ".ipynb_checkpoints" in path.parts:
            continue
        yield path


def main() -> None:
    if not NOTEBOOKS_DIR.is_dir():
        raise SystemExit(f"Notebooks directory not found: {NOTEBOOKS_DIR}")

    repo_root = NOTEBOOKS_DIR.parent
    cleared = 0
    for path in iter_notebooks(NOTEBOOKS_DIR):
        if clear_notebook_outputs(path):
            print(f"Cleared outputs: {path.relative_to(repo_root)}")
            cleared += 1

    if cleared == 0:
        print(f"No notebook outputs to clear under {NOTEBOOKS_DIR}")


if __name__ == "__main__":
    main()
