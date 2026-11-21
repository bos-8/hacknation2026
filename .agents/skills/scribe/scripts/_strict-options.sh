# Optional strict checks use the shared Python/Node backend; basic native checks stay independent.
scribe_strict() {
    _scribe_target=$1
    shift
    for _scribe_option in "$@"; do
        case "$_scribe_option" in
            --strict|--strict-metadata|--strict-markdown|--strict-mermaid|--tool-root|--file)
                _scribe_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
                exec sh "$_scribe_dir/_runtime.sh" py "$_scribe_dir/$_scribe_target" "$@"
                ;;
        esac
    done
}
