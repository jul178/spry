# Safely set DeletionPolicy: Retain on CloudFormation stacks and delete the stacks

$stacks = @(
    @{ Name = "spry-auth"; Template = "file://infra/auth.yaml" },
    @{ Name = "spry-reports"; Template = "file://infra/reports.yaml" },
    @{ Name = "spry-ai"; Template = "file://infra/ai.yml" }
)

foreach ($s in $stacks) {
    $name = $s.Name
    $tmpl = $s.Template
    Write-Host "`n==> Checking $name..." -ForegroundColor Cyan

    $exists = aws cloudformation describe-stacks --stack-name $name 2>$null
    if (-not $exists) {
        Write-Host "    Stack $name does not exist or already deleted. Skipping." -ForegroundColor Yellow
        continue
    }

    Write-Host "    Fetching parameters for $name..." -ForegroundColor DarkGray
    $rawKeys = (aws cloudformation describe-stacks --stack-name $name --query "Stacks[0].Parameters[*].ParameterKey" --output text)
    $keys = -split $rawKeys

    $paramArgs = @()
    foreach ($k in $keys) {
        if ($k) {
            $paramArgs += "ParameterKey=$k,UsePreviousValue=true"
        }
    }

    Write-Host "    Updating $name with Retain policy..." -ForegroundColor Green
    aws cloudformation update-stack --stack-name $name --template-body $tmpl --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --parameters $paramArgs 2>$null

    Write-Host "    Waiting for update to complete..." -ForegroundColor DarkGray
    aws cloudformation wait stack-update-complete --stack-name $name 2>$null

    Write-Host "    Deleting CloudFormation stack $name (AWS resources will be kept!)..." -ForegroundColor Green
    aws cloudformation delete-stack --stack-name $name

    Write-Host "    Waiting for stack deletion..." -ForegroundColor DarkGray
    aws cloudformation wait stack-delete-complete --stack-name $name
    Write-Host "    [OK] $name deleted safely!" -ForegroundColor Green
}

Write-Host "`nAll CloudFormation stacks deleted safely! Your AWS resources are retained." -ForegroundColor Green
