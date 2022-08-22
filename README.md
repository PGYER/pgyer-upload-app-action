# pgyer-upload-app-action

This action uploads an application file to PGYER

## Inputs and Outpus

See action.yml of your version.

## Example usage

Please make sure your workflow will run when a branch is pushed.

    on:
      push or pull_request

Add this action to steps.

    uses: PGYER/pgyer-upload-app-action@<version>
      with:
        _api_key: ${{ secrets.PGYER_API_TOKEN }} # for example
        appFilePath: /path/to/app_file
        
## Release        

    ncc build index.js --license licenses.txt
